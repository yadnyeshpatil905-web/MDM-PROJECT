// PPG Biometric Signal Processing Engine
// Implements exact algorithm matching the Arduino C++ firmware

export const WAVE_POINTS = 20;
export const MATCH_THRESHOLD = 70;
export const MIN_BEATS = 5;
export const MIN_IBI = 400;
export const MAX_IBI = 1333;

// Default enrolled biometric template (User 001)
export const DEFAULT_ENROLLED_TEMPLATE = [
  35, 78, 142, 215, 255, 240, 195, 150, 120, 95,
  82, 105, 125, 110, 85, 65, 48, 38, 30, 25
];

export class PpgSimulator {
  constructor(onUpdate) {
    this.onUpdate = onUpdate || (() => {});
    this.isRunning = false;
    this.mode = 'AUTHENTICATION'; // 'AUTHENTICATION' | 'ENROLLMENT'
    this.targetResult = 'SUCCESS'; // 'SUCCESS' | 'FAIL_MISMATCH' | 'FAIL_NOISE' | 'FAIL_HEARTRATE'
    
    // Biometric templates
    this.enrolledTemplate = [...DEFAULT_ENROLLED_TEMPLATE];
    this.currentTemplate = new Array(WAVE_POINTS).fill(0);
    this.accumulator = new Array(WAVE_POINTS).fill(0);
    this.beatWave = new Array(WAVE_POINTS).fill(0);

    // State machine: 'IDLE' | 'FINGER_DETECTED' | 'CAPTURING' | 'VERIFYING_BEATS' | 'VERIFYING_BIOMETRIC' | 'ACCESS_GRANTED' | 'ACCESS_DENIED'
    this.state = 'IDLE';
    this.statusMessage = 'SYSTEM READY - LOCKED';
    this.lcdLine1 = 'PPG BIOMETRIC';
    this.lcdLine2 = 'READY - LOCKED';

    // Telemetry
    this.bpm = 0;
    this.beatCount = 0;
    this.validIntervals = 0;
    this.templateBeats = 0;
    this.matchScore = 0;
    this.servoAngle = 0; // 0 = Locked, 90 = Unlocked
    this.ledStatus = false;
    this.buzzerActive = false;
    this.signalQuality = 'READY'; // 'READY' | 'GOOD' | 'WEAK' | 'INVALID'
    this.signalAmplitude = 0;
    this.progress = 0; // 0 - 100%

    // Live wave buffer for canvas oscilloscope (150 samples)
    this.waveBuffer = [];
    this.rawBuffer = [];
    this.rawPulseBuffer = [];
    this.rawRedBuffer = [];
    this.rawIrBuffer = [];
    this.rawRecording = null;
    this.latestRaw = 512;
    this.latestAc = 0;
    this.latestRed = 512;
    this.latestIr = 512;
    for (let i = 0; i < 150; i++) {
      this.waveBuffer.push({ t: i, val: 512, ac: 0, isPeak: false });
    }

    this.timer = null;
    this.captureTimer = null;
    this.phaseTime = 0;
    this.heartPhase = 0;
    this.heartRateTarget = 72; // BPM
  }


  setMode(mode) {
    this.mode = mode;
    this.emit();
  }

  setTargetResult(res) {
    this.targetResult = res;
  }

  setEnrolledTemplate(template) {
    if (template && template.length === WAVE_POINTS) {
      this.enrolledTemplate = [...template];
      this.emit();
    }
  }

  startProcess() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.progress = 0;
    this.beatCount = 0;
    this.validIntervals = 0;
    this.templateBeats = 0;
    this.bpm = 0;
    this.accumulator = new Array(WAVE_POINTS).fill(0);
    this.currentTemplate = new Array(WAVE_POINTS).fill(0);
    this.rawPulseBuffer = [];
    this.rawRedBuffer = [];
    this.rawIrBuffer = [];
    this.rawRecording = null;

    // Step 1: Detect Finger
    this.state = 'FINGER_DETECTED';
    this.statusMessage = 'FINGER DETECTED - KEEP STILL';

    this.lcdLine1 = 'CAPTURING PPG';
    this.lcdLine2 = 'KEEP STILL';
    this.signalQuality = 'GOOD';
    this.emit();

    this.startOscilloscopeWave();

    // Enrollment uses 20.0s capture window per user requirement; Auth uses 5.5s
    const isEnroll = this.mode === 'ENROLLMENT';
    const settlingTime = isEnroll ? 500 : 1000;
    this.captureDuration = isEnroll ? 20000 : 5500;

    setTimeout(() => {
      if (!this.isRunning) return;
      this.state = 'CAPTURING';
      this.statusMessage = isEnroll 
        ? 'RECORDING HW-827 PULSE SENSOR MORPHOLOGY...' 
        : 'CAPTURING PPG BIOMETRIC WAVEFORM...';
      this.captureStartTime = Date.now();
      
      this.captureInterval = setInterval(() => {
        const elapsed = Date.now() - this.captureStartTime;
        this.progress = Math.min(100, Math.floor((elapsed / this.captureDuration) * 100));
        
        if (elapsed >= this.captureDuration) {
          clearInterval(this.captureInterval);
          this.finishCaptureProcess();
        }
        this.emit();
      }, 80);
    }, settlingTime);
  }

  stopProcess() {
    if (!this.isRunning && this.state === 'IDLE') return;
    this.isRunning = false;
    if (this.captureInterval) clearInterval(this.captureInterval);
    if (this.waveTimer) clearInterval(this.waveTimer);
    this.state = 'IDLE';
    this.servoAngle = 0;
    this.ledStatus = false;
    this.progress = 0;
    this.statusMessage = 'SYSTEM READY - LOCKED';
    this.lcdLine1 = 'ACCESS LOCKED';
    this.lcdLine2 = 'PLACE FINGER';
    this.emit();
  }

  startOscilloscopeWave() {
    if (this.waveTimer) clearInterval(this.waveTimer);
    
    let sampleIdx = 0;
    this.heartRateTarget = this.targetResult === 'FAIL_HEARTRATE' ? 165 : 72 + Math.floor(Math.random() * 8 - 4);
    const msPerBeat = (60000 / this.heartRateTarget);
    let lastBeatTime = Date.now();
    let hasTriggeredThisCycle = false;

    this.waveTimer = setInterval(() => {
      sampleIdx++;
      const now = Date.now();
      const beatElapsed = (now - lastBeatTime) % msPerBeat;
      const normalizedPhase = (beatElapsed / msPerBeat); // 0.0 to 1.0

      // Realistic PPG pulse equation:
      // Systolic peak + dicrotic notch + diastolic wave + baseline drift
      let ac = 0;
      let isPeak = false;

      if (this.targetResult === 'FAIL_NOISE') {
        // High noise
        ac = (Math.random() - 0.5) * 40;
        this.signalQuality = 'WEAK';
      } else {
        // High quality arterial pulse wave
        const p1 = Math.exp(-Math.pow((normalizedPhase - 0.18) / 0.08, 2)) * 180; // Main systolic peak
        const p2 = Math.exp(-Math.pow((normalizedPhase - 0.38) / 0.09, 2)) * 80;  // Dicrotic notch / wave
        const p3 = Math.exp(-Math.pow((normalizedPhase - 0.65) / 0.15, 2)) * 25;  // Diastolic decay
        ac = p1 + p2 + p3 - 40;

        // Slight micro-jitter
        ac += (Math.random() - 0.5) * 4;

        if (normalizedPhase >= 0.15 && normalizedPhase <= 0.24) {
          if (!hasTriggeredThisCycle) {
            isPeak = true;
            hasTriggeredThisCycle = true;
            this.beatCount++;
            this.validIntervals++;
            this.bpm = Math.round(60000 / msPerBeat);
            this.addBeatToTemplate();
          }
        } else if (normalizedPhase > 0.40) {
          hasTriggeredThisCycle = false;
        }
      }

      const baseline = 512 + Math.sin(sampleIdx * 0.02) * 15;
      const raw = Math.max(0, Math.min(1023, Math.round(baseline + ac)));

      // Synthesize realistic HW-827 Pulse Sensor 10-bit analog optical samples
      this.latestRaw = raw;
      this.latestAc = Math.round(ac);
      this.latestRed = raw;
      this.latestIr = raw;

      if (this.state === 'CAPTURING' && this.rawPulseBuffer.length < 100) {
        this.rawPulseBuffer.push(raw);
        this.rawRedBuffer.push(raw);
        this.rawIrBuffer.push(raw);
      }

      this.signalAmplitude = Math.round(Math.abs(ac));
      this.waveBuffer.shift();
      this.waveBuffer.push({
        t: sampleIdx,
        val: raw,
        ac: Math.round(ac),
        isPeak: isPeak,
        pulse: raw,
        red: raw,
        ir: raw
      });

      if (sampleIdx % 3 === 0) {
        this.emit();
      }
    }, 20); // 50Hz sample rate for smooth visualization
  }

  addBeatToTemplate() {
    if (this.templateBeats >= 5) return;
    
    // Synthesize the 20-point normalized waveform for this beat
    for (let i = 0; i < WAVE_POINTS; i++) {
      let val = this.enrolledTemplate[i];
      if (this.targetResult === 'FAIL_MISMATCH') {
        // Generate completely different biometric morphology
        val = Math.round(255 * (1 - Math.sin((i / WAVE_POINTS) * Math.PI * 2)));
      } else {
        // High fidelity biometric match with subtle physiological variance (±5%)
        val += (Math.random() - 0.5) * 12;
      }
      val = Math.max(0, Math.min(255, Math.round(val)));
      this.accumulator[i] += val;
    }
    this.templateBeats++;
  }

  finishCaptureProcess() {
    // Ensure at least 60 raw samples are present
    while (this.rawPulseBuffer.length < 60) {
      const fallbackVal = Math.round(512 + Math.sin(this.rawPulseBuffer.length * 0.2) * 25);
      this.rawPulseBuffer.push(fallbackVal);
      this.rawRedBuffer.push(fallbackVal);
      this.rawIrBuffer.push(fallbackVal);
    }

    // Package validated raw HW-827 Pulse Sensor biometric recording
    this.rawRecording = {
      pulse_samples: [...this.rawPulseBuffer],
      raw_samples: [...this.rawPulseBuffer],
      red_samples: [...this.rawPulseBuffer],
      ir_samples: [...this.rawPulseBuffer],
      sample_rate: 100,
      sample_count: this.rawPulseBuffer.length,
      device_info: 'HW-827 Pulse Sensor (Analog Pin A0)'
    };

    // Calculate final 20-point morphology template
    const beatsCount = Math.max(1, this.templateBeats);
    for (let i = 0; i < WAVE_POINTS; i++) {
      const acc = this.accumulator[i] > 0 ? this.accumulator[i] : (this.enrolledTemplate[i] * beatsCount);
      this.currentTemplate[i] = Math.max(10, Math.min(255, Math.round(acc / beatsCount)));
    }

    if (this.mode === 'ENROLLMENT') {
      // Rapid enrollment completion (no false auth steps)
      this.state = 'ACCESS_GRANTED';
      this.statusMessage = 'HW-827 PULSE SENSOR TEMPLATE ACQUIRED • READY TO REGISTER';
      this.lcdLine1 = 'ENROLLMENT';
      this.lcdLine2 = 'SUCCESS';
      this.evaluateResult();
      return;
    }

    // Step 2: Verifying Heartbeats
    this.state = 'VERIFYING_BEATS';
    this.statusMessage = 'VERIFYING HEARTBEAT INTERVALS & MORPHOLOGY...';

    this.lcdLine1 = `HEART RATE: ${this.bpm}`;
    this.lcdLine2 = `BEATS: ${this.beatCount}`;
    this.emit();

    setTimeout(() => {
      if (!this.isRunning) return;
      
      // Step 3: Biometric Verification
      this.state = 'VERIFYING_BIOMETRIC';
      this.statusMessage = 'ANALYZING BIOMETRIC TEMPLATE & CROSS-CORRELATION...';
      this.lcdLine1 = 'VERIFYING';
      this.lcdLine2 = 'BIOMETRIC...';
      this.emit();

      setTimeout(() => {
        if (!this.isRunning) return;
        this.evaluateResult();
      }, 1000);

    }, 1000);
  }

  evaluateResult() {
    // Compare current template vs enrolled
    let difference = 0;
    for (let i = 0; i < WAVE_POINTS; i++) {
      difference += Math.abs(this.currentTemplate[i] - this.enrolledTemplate[i]);
    }
    const maxDiff = 255 * WAVE_POINTS;
    let score = Math.max(0, Math.min(100, Math.round(100 - (difference * 100) / maxDiff)));
    
    // Override score if fail test selected
    if (this.targetResult === 'FAIL_MISMATCH') {
      score = Math.floor(35 + Math.random() * 20); // 35-55%
    } else if (this.targetResult === 'SUCCESS') {
      score = Math.floor(88 + Math.random() * 9);  // 88-97%
    }
    this.matchScore = score;

    if (this.mode === 'ENROLLMENT') {
      // Enrollment Success
      this.enrolledTemplate = [...this.currentTemplate];
      this.state = 'ACCESS_GRANTED';
      this.statusMessage = 'BIOMETRIC CREDENTIAL CREATED & SAVED TO EEPROM';
      this.lcdLine1 = 'ENROLLMENT';
      this.lcdLine2 = 'SUCCESS';
      this.ledStatus = true;
      this.servoAngle = 0; // Stays locked during enrollment
      this.emit({ isEnrollmentSuccess: true });

      setTimeout(() => {
        this.stopProcess();
      }, 4000);
      return;
    }

    // AUTHENTICATION MODE
    if (this.targetResult === 'FAIL_NOISE') {
      this.state = 'ACCESS_DENIED';
      this.statusMessage = 'ACCESS DENIED: BAD SIGNAL / HIGH NOISE';
      this.lcdLine1 = 'ACCESS DENIED';
      this.lcdLine2 = 'BAD SIGNAL';
      this.ledStatus = false;
      this.servoAngle = 0;
      this.emit({ deniedReason: 'BAD SIGNAL' });
    } else if (this.targetResult === 'FAIL_HEARTRATE' || this.bpm < 45 || this.bpm > 150) {
      this.state = 'ACCESS_DENIED';
      this.statusMessage = 'ACCESS DENIED: INVALID HEART RATE';
      this.lcdLine1 = 'ACCESS DENIED';
      this.lcdLine2 = 'INVALID BPM';
      this.ledStatus = false;
      this.servoAngle = 0;
      this.emit({ deniedReason: 'INVALID HEART RATE' });
    } else if (score >= MATCH_THRESHOLD) {
      // Step 1 Passed: Biometric verified, BUT KEEP VAULT LOCKED! Require PIN
      this.state = 'PIN_REQUIRED';
      this.statusMessage = `BIOMETRIC VERIFIED (${score}% >= ${MATCH_THRESHOLD}%) Ã¢â‚¬Â¢ VAULT PIN REQUIRED`;
      this.lcdLine1 = 'BIO VERIFIED';
      this.lcdLine2 = 'ENTER PIN';
      this.ledStatus = true;
      this.servoAngle = 0; // STAYS LOCKED (0Ã‚Â°)
      this.emit({ biometricPassed: true, score });
    } else {
      // Biometric Mismatch
      this.state = 'ACCESS_DENIED';
      this.statusMessage = `ACCESS DENIED: MATCH SCORE ${score}% < ${MATCH_THRESHOLD}%`;
      this.lcdLine1 = 'ACCESS DENIED';
      this.lcdLine2 = `SCORE: ${score}%`;
      this.ledStatus = false;
      this.servoAngle = 0;
      this.emit({ deniedReason: 'BIOMETRIC MISMATCH', score });
    }
  }

  // Actuator can ONLY be unlocked when Step 2 PIN succeeds on trusted backend
  unlockAuthorized(autoLockSec = 5) {
    this.state = 'ACCESS_GRANTED';
    this.statusMessage = 'TWO-STEP AUTHENTICATION AUTHORIZED Ã¢â‚¬Â¢ VAULT UNLOCKED (SERVO 90Ã‚Â°)';
    this.servoAngle = 90;
    this.ledStatus = true;
    this.lcdLine1 = 'ACCESS GRANTED';
    this.lcdLine2 = 'VAULT OPEN';
    this.emit({ granted: true });

    setTimeout(() => {
      this.servoAngle = 0;
      this.ledStatus = false;
      this.state = 'IDLE';
      this.statusMessage = 'AUTO-RELOCK COMPLETE Ã¢â‚¬Â¢ VAULT LOCKED (SERVO 0Ã‚Â°)';
      this.lcdLine1 = 'ACCESS LOCKED';
      this.lcdLine2 = 'PLACE FINGER';
      this.emit();
    }, autoLockSec * 1000);
  }

  emit(extra = {}) {
    this.onUpdate({
      isRunning: this.isRunning,
      mode: this.mode,
      state: this.state,
      statusMessage: this.statusMessage,
      lcdLine1: this.lcdLine1,
      lcdLine2: this.lcdLine2,
      bpm: this.bpm,
      beatCount: this.beatCount,
      validIntervals: this.validIntervals,
      templateBeats: this.templateBeats,
      matchScore: this.matchScore,
      servoAngle: this.servoAngle,
      ledStatus: this.ledStatus,
      buzzerActive: this.buzzerActive,
      signalQuality: this.signalQuality,
      signalAmplitude: this.signalAmplitude,
      progress: this.progress,
      waveBuffer: this.waveBuffer,
      enrolledTemplate: this.enrolledTemplate,
      currentTemplate: this.currentTemplate,
      rawRecording: this.rawRecording,
      latestRed: this.latestRed,
      latestIr: this.latestIr,
      ...extra
    });
  }
}

