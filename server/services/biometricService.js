import { DEFAULT_CONFIG, RAW_RECORDING_CONFIG } from '../models/constants.js';

/**
 * Biometric Signal Processing & Morphology Matching Service
 * 
 * Supports:
 * 1. 20-point normalized systolic/diastolic template validation & comparison.
 * 2. HW-827 Pulse Sensor raw waveform enrollment validation,
 *    physiological bounds checking, and cross-session evaluation benchmarks.
 */
export class BiometricService {
  /**
   * Validates if a template vector meets firmware format (20 normalized integers 0-255).
   */
  static validateTemplate(template) {
    if (!Array.isArray(template) || template.length !== DEFAULT_CONFIG.WAVE_POINTS) {
      return {
        valid: false,
        error: `Template must contain exactly ${DEFAULT_CONFIG.WAVE_POINTS} normalized points.`
      };
    }

    for (let i = 0; i < template.length; i++) {
      const val = Number(template[i]);
      if (isNaN(val) || val < 0 || val > 255) {
        return {
          valid: false,
          error: `Point at index ${i} (${template[i]}) is out of bounds (must be 0-255).`
        };
      }
    }

    // Verify non-flatline
    const minVal = Math.min(...template);
    const maxVal = Math.max(...template);
    if (maxVal - minVal < 15) {
      return {
        valid: false,
        error: 'Insufficient signal amplitude. The sensor captured flatline or noise.'
      };
    }

    return { valid: true };
  }

  /**
   * Compares candidate live PPG template against enrolled template.
   * Returns match score percentage (0 - 100).
   */
  static compareTemplates(currentTemplate, enrolledTemplate) {
    const valCurr = this.validateTemplate(currentTemplate);
    if (!valCurr.valid) throw new Error(`Invalid live template: ${valCurr.error}`);

    const valEnr = this.validateTemplate(enrolledTemplate);
    if (!valEnr.valid) throw new Error(`Invalid enrolled template: ${valEnr.error}`);

    const N = DEFAULT_CONFIG.WAVE_POINTS;
    let difference = 0;
    let meanC = 0;
    let meanE = 0;
    let maxIdxC = 0;
    let maxIdxE = 0;

    for (let i = 0; i < N; i++) {
      difference += Math.abs(currentTemplate[i] - enrolledTemplate[i]);
      meanC += currentTemplate[i];
      meanE += enrolledTemplate[i];
      if (currentTemplate[i] > currentTemplate[maxIdxC]) maxIdxC = i;
      if (enrolledTemplate[i] > enrolledTemplate[maxIdxE]) maxIdxE = i;
    }

    meanC /= N;
    meanE /= N;

    // Pearson Cross-Correlation Coefficient of morphology
    let num = 0;
    let denC = 0;
    let denE = 0;
    for (let i = 0; i < N; i++) {
      const dc = currentTemplate[i] - meanC;
      const de = enrolledTemplate[i] - meanE;
      num += dc * de;
      denC += dc * dc;
      denE += de * de;
    }

    const r = (denC > 0 && denE > 0) ? (num / Math.sqrt(denC * denE)) : 0;
    const pearsonScore = Math.max(0, Math.min(100, Math.round(r * 100)));

    // Peak latency alignment penalty (8% penalty per shifted index)
    const peakDiff = Math.abs(maxIdxC - maxIdxE);
    const peakPenalty = peakDiff * 8;

    // Calculate discriminant score
    let score;
    if (difference === 0) {
      score = 100;
    } else {
      score = Math.max(0, Math.min(100, Math.round(pearsonScore - peakPenalty)));
    }

    const maximum = 255 * N;

    return {
      score,
      difference,
      maxDifference: maximum,
      pearsonCorrelation: parseFloat(r.toFixed(3)),
      peakOffset: peakDiff,
      matched: score >= DEFAULT_CONFIG.MATCH_THRESHOLD
    };
  }

  /**
   * Validates raw HW-827 Pulse Sensor biometric recordings.
   * Enforces 10-bit ADC ranges [0, 1023] (or configured max), sample rate constraints,
   * recording-size bounds, and minimum physiological pulsation dynamic range.
   */
  static validateRawRecording(recording) {
    if (!recording || typeof recording !== 'object') {
      return { valid: false, error: 'Raw recording payload must be an object.' };
    }

    const {
      pulse_samples,
      raw_samples,
      red_samples,
      ir_samples,
      sample_rate,
      sample_count
    } = recording;

    const count = Number(sample_count);
    if (!Number.isInteger(count) || count < RAW_RECORDING_CONFIG.MIN_SAMPLES || count > RAW_RECORDING_CONFIG.MAX_SAMPLES) {
      return {
        valid: false,
        error: `sample_count must be an integer between ${RAW_RECORDING_CONFIG.MIN_SAMPLES} and ${RAW_RECORDING_CONFIG.MAX_SAMPLES}. Received: ${sample_count}`
      };
    }

    const rate = Number(sample_rate);
    if (!Number.isInteger(rate) || rate < RAW_RECORDING_CONFIG.MIN_SAMPLE_RATE || rate > RAW_RECORDING_CONFIG.MAX_SAMPLE_RATE) {
      return {
        valid: false,
        error: `sample_rate must be an integer between ${RAW_RECORDING_CONFIG.MIN_SAMPLE_RATE} and ${RAW_RECORDING_CONFIG.MAX_SAMPLE_RATE} Hz. Received: ${sample_rate}`
      };
    }

    // Determine signal channels: prioritize single-channel HW-827 Pulse Sensor
    const primarySamples = (pulse_samples && Array.isArray(pulse_samples)) 
      ? pulse_samples 
      : (raw_samples && Array.isArray(raw_samples)) 
        ? raw_samples 
        : null;

    const hasDualChannel = Array.isArray(red_samples) && Array.isArray(ir_samples);

    if (!primarySamples && !hasDualChannel) {
      return {
        valid: false,
        error: 'HW-827 Pulse Sensor recording must contain pulse_samples (or raw_samples) array.'
      };
    }

    // If dual channel is provided without single channel or vice versa, reconcile them
    if (primarySamples) {
      if (primarySamples.length !== count) {
        return {
          valid: false,
          error: `pulse_samples array length (${primarySamples.length}) does not match sample_count (${count}).`
        };
      }

      let pulseMin = Infinity;
      let pulseMax = -Infinity;

      for (let i = 0; i < count; i++) {
        const val = Number(primarySamples[i]);
        if (isNaN(val) || !Number.isFinite(val) || val < RAW_RECORDING_CONFIG.ADC_MIN_VALUE || val > RAW_RECORDING_CONFIG.ADC_MAX_VALUE) {
          return {
            valid: false,
            error: `pulse_samples contains invalid value at index ${i} (${primarySamples[i]}). Must be between ${RAW_RECORDING_CONFIG.ADC_MIN_VALUE} and ${RAW_RECORDING_CONFIG.ADC_MAX_VALUE}.`
          };
        }
        if (val < pulseMin) pulseMin = val;
        if (val > pulseMax) pulseMax = val;
      }

      const pulseRange = pulseMax - pulseMin;
      if (pulseRange < RAW_RECORDING_CONFIG.MIN_DYNAMIC_RANGE) {
        return {
          valid: false,
          error: 'Insufficient signal dynamic range detected. Waveform is flatline or disconnected.'
        };
      }

      // Populate red_samples and ir_samples for backwards compatibility with existing database rows
      if (!recording.red_samples) recording.red_samples = [...primarySamples];
      if (!recording.ir_samples) recording.ir_samples = [...primarySamples];
      if (!recording.pulse_samples) recording.pulse_samples = [...primarySamples];

      return {
        valid: true,
        stats: {
          sampleCount: count,
          sampleRate: rate,
          durationSeconds: (count / rate).toFixed(2),
          pulseMin,
          pulseMax,
          pulseRange,
          redMin: pulseMin,
          redMax: pulseMax,
          redRange: pulseRange,
          irMin: pulseMin,
          irMax: pulseMax,
          irRange: pulseRange
        }
      };
    }

    // Dual-channel fallback validation
    if (red_samples.length !== count) {
      return {
        valid: false,
        error: `red_samples array length (${red_samples.length}) does not match sample_count (${count}).`
      };
    }

    if (ir_samples.length !== count) {
      return {
        valid: false,
        error: `ir_samples array length (${ir_samples.length}) does not match sample_count (${count}).`
      };
    }

    let redMin = Infinity;
    let redMax = -Infinity;
    let irMin = Infinity;
    let irMax = -Infinity;

    for (let i = 0; i < count; i++) {
      const r = Number(red_samples[i]);
      const ir = Number(ir_samples[i]);

      if (isNaN(r) || !Number.isFinite(r) || r < RAW_RECORDING_CONFIG.ADC_MIN_VALUE || r > RAW_RECORDING_CONFIG.ADC_MAX_VALUE) {
        return {
          valid: false,
          error: `red_samples contains invalid value at index ${i} (${red_samples[i]}). Must be between ${RAW_RECORDING_CONFIG.ADC_MIN_VALUE} and ${RAW_RECORDING_CONFIG.ADC_MAX_VALUE}.`
        };
      }
      if (isNaN(ir) || !Number.isFinite(ir) || ir < RAW_RECORDING_CONFIG.ADC_MIN_VALUE || ir > RAW_RECORDING_CONFIG.ADC_MAX_VALUE) {
        return {
          valid: false,
          error: `ir_samples contains invalid value at index ${i} (${ir_samples[i]}). Must be between ${RAW_RECORDING_CONFIG.ADC_MIN_VALUE} and ${RAW_RECORDING_CONFIG.ADC_MAX_VALUE}.`
        };
      }

      if (r < redMin) redMin = r;
      if (r > redMax) redMax = r;
      if (ir < irMin) irMin = ir;
      if (ir > irMax) irMax = ir;
    }

    const redRange = redMax - redMin;
    const irRange = irMax - irMin;

    if (redRange < RAW_RECORDING_CONFIG.MIN_DYNAMIC_RANGE && irRange < RAW_RECORDING_CONFIG.MIN_DYNAMIC_RANGE) {
      return {
        valid: false,
        error: 'Insufficient signal dynamic range detected. Waveform is flatline or disconnected.'
      };
    }

    recording.pulse_samples = [...red_samples];

    return {
      valid: true,
      stats: {
        sampleCount: count,
        sampleRate: rate,
        durationSeconds: (count / rate).toFixed(2),
        pulseMin: redMin,
        pulseMax: redMax,
        pulseRange: redRange,
        redMin,
        redMax,
        redRange,
        irMin,
        irMax,
        irRange
      }
    };
  }

  /**
   * Evaluates correlation between two separate raw PPG recordings for biometric analysis.
   * 
   * NOTE: As per requirement 7, two-person identification cannot be claimed until
   * a validated multi-recording matching algorithm is formally trained and evaluated
   * across multiple independent subjects and sessions.
   */
  static evaluateRecordingPair(recordingA, recordingB) {
    if (!recordingA || !recordingB) {
      throw new Error('Both recordingA and recordingB are required for evaluation.');
    }

    const valA = this.validateRawRecording(recordingA);
    if (!valA.valid) throw new Error(`Invalid recording A: ${valA.error}`);

    const valB = this.validateRawRecording(recordingB);
    if (!valB.valid) throw new Error(`Invalid recording B: ${valB.error}`);

    // Compute Pearson correlation on normalized pulse AC signals
    const normalize = (samples) => {
      const mean = samples.reduce((acc, v) => acc + v, 0) / samples.length;
      return samples.map(v => v - mean);
    };

    const getSamples = (rec) => rec.pulse_samples || rec.raw_samples || rec.ir_samples || rec.red_samples;
    const normA = normalize(getSamples(recordingA));
    const normB = normalize(getSamples(recordingB));

    const minLen = Math.min(normA.length, normB.length);
    let sumAB = 0;
    let sumA2 = 0;
    let sumB2 = 0;

    for (let i = 0; i < minLen; i++) {
      sumAB += normA[i] * normB[i];
      sumA2 += normA[i] * normA[i];
      sumB2 += normB[i] * normB[i];
    }

    const denominator = Math.sqrt(sumA2 * sumB2);
    const correlation = denominator > 0 ? (sumAB / denominator) : 0;

    return {
      correlation: Number(correlation.toFixed(4)),
      evaluatedSamples: minLen,
      preliminaryMatch: correlation > 0.75,
      scientificNotice: 'Enrollment phase completed. Identification accuracy between multiple individuals requires cross-session evaluation on separate datasets with physiological normalization.'
    };
  }

  /**
   * Architectural & Physiological limitation notice.
   */
  static getBiometricLimitations() {
    return {
      sensorTypes: ['HW-827 Heartbeat / Pulse Sensor (Single-channel 10-bit ADC Pin A0)'],
      featureVector: 'Raw HW-827 Pulse Sensor Waveform (10-bit ADC) + 20-point normalized pulse morphology',
      limitations: [
        'Capillary blood volume curve varies with finger contact pressure, posture, and autonomic tone on the HW-827 Pulse Sensor.',
        'Ambient temperature and autonomic nervous system state (stress/vasoconstriction) shift dicrotic notch timing.',
        'Heart rate (BPM) values alone are physiological vital signs, NOT unique cryptographic identifiers.',
        'Raw HW-827 Pulse Sensor waveforms require enrollment collection first; two-person identification must not be claimed without separate dataset benchmarking.',
        'Morphology matching provides a physical presence verification factor, which must be paired with Step 2 (Vault PIN) for secure access control.'
      ]
    };
  }
}

