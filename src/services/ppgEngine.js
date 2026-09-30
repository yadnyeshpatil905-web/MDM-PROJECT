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

    // Step 1: Detect Finger
    this.state = 'FINGER_DETECTED';
    this.statusMessage = 'FINGER DETECTED - KEEP STILL';
    this.lcdLine1 = 'CAPTURING PPG';
    this.lcdLine2 = 'KEEP STILL';
    this.signalQuality = 'GOOD';
    this.emit();

    this.startOscilloscopeWave();

    // After 1.2s finger settling, start 10s capture (or 6s fast interactive demo)
    setTimeout(() => {
      if (!this.isRunning) return;
      this.state = 'CAPTURING';
      this.statusMessage = 'CAPTURING PPG BIOMETRIC WAVEFORM...';
      this.captureStartTime = Date.now();
      this.captureDuration = 7000; // 7 seconds capture
      
      this.captureInterval = setInterval(() => {
        const elapsed = Date.now() - this.captureStartTime;
        this.progress = Math.min(100, Math.floor((elapsed / this.captureDuration) * 100));
        
        if (elapsed >= this.captureDuration) {
          clearInterval(this.captureInterval);
          this.finishCaptureProcess();
        }
        this.emit();
      }, 100);
    }, 1200);
  }

  stopProcess() {
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

        if (normalizedPhase >= 0.17 && normalizedPhase <= 0.20 && Math.abs(normalizedPhase - 0.18) < 0.02) {
          isPeak = true;
          if (this.state === 'CAPTURING' && (now - lastBeatTime) > msPerBeat * 0.8) {
            this.beatCount++;
            this.validIntervals++;
            this.bpm = Math.round(60000 / msPerBeat);
            this.addBeatToTemplate();
          }
        }
      }

      const baseline = 512 + Math.sin(sampleIdx * 0.02) * 15;
      const raw = Math.round(baseline + ac);

      this.signalAmplitude = Math.round(Math.abs(ac));
      this.waveBuffer.shift();
      this.waveBuffer.push({
        t: sampleIdx,
        val: raw,
        ac: Math.round(ac),
        isPeak: isPeak
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
    // Calculate final template
    if (this.templateBeats > 0) {
      for (let i = 0; i < WAVE_POINTS; i++) {
        this.currentTemplate[i] = Math.min(255, Math.round(this.accumulator[i] / this.templateBeats));
      }
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
      }, 1500);

    }, 1500);
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
      // SUCCESS! Access Granted
      this.state = 'ACCESS_GRANTED';
      this.statusMessage = `ACCESS GRANTED - MATCH SCORE: ${score}%`;
      this.lcdLine1 = 'ACCESS GRANTED';
      this.lcdLine2 = `MATCH: ${score}%`;
      this.ledStatus = true;
      this.servoAngle = 90; // UNLOCK SERVO
      this.emit({ granted: true });

      // Auto-lock after 5 seconds matching Arduino delay(5000)
      setTimeout(() => {
        if (this.state === 'ACCESS_GRANTED') {
          this.servoAngle = 0;
          this.ledStatus = false;
          this.statusMessage = 'SYSTEM LOCKED AGAIN';
          this.lcdLine1 = 'ACCESS LOCKED';
          this.lcdLine2 = 'PLACE FINGER';
          this.emit();

          setTimeout(() => {
            this.stopProcess();
          }, 1500);
        }
      }, 5000);
    } else {
      // DENIED: Mismatch
      this.state = 'ACCESS_DENIED';
      this.statusMessage = `ACCESS DENIED: BIOMETRIC MISMATCH (${score}% < ${MATCH_THRESHOLD}%)`;
      this.lcdLine1 = 'ACCESS DENIED';
      this.lcdLine2 = 'NO MATCH';
      this.ledStatus = false;
      this.servoAngle = 0;
      this.emit({ deniedReason: 'BIOMETRIC MISMATCH' });

      setTimeout(() => {
        this.stopProcess();
      }, 3500);
    }
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
      ...extra
    });
  }
}
