// Iron Man's F.R.I.D.A.Y. Tactical AI Voice Synthesizer
// Voiced with calm, crisp, articulate female AI persona (Irish/British accent priority)
// Integrates Web Speech API + Web Audio API holographic UI activation chirp

class FridayVoiceEngine {
  constructor() {
    this.muted = false;
    this.voice = null;
    this.initialized = false;
    this.onSubtitleChange = null;
    this.currentSubtitle = '';
    this.isSpeaking = false;
    this.audioCtx = null;
    this.selectedVoiceName = 'Auto (F.R.I.D.A.Y. Optimal)';

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.initVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => this.initVoices();
      }
    }
  }

  initAudio() {
    if (!this.audioCtx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
  }

  // Play Stark Industries holographic HUD activation chirp before F.R.I.D.A.Y. speaks
  playStarkChirp() {
    if (this.muted) return;
    this.initAudio();
    if (!this.audioCtx) return;

    try {
      const now = this.audioCtx.currentTime;
      // High-tech holographic two-tone chirp
      const osc1 = this.audioCtx.createOscillator();
      const gain1 = this.audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1760, now); // A6
      osc1.frequency.exponentialRampToValueAtTime(2640, now + 0.06); // E7
      gain1.gain.setValueAtTime(0.12, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc1.connect(gain1);
      gain1.connect(this.audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.08);
    } catch (e) {}
  }

  initVoices() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return;

    // F.R.I.D.A.Y. voice selection priority:
    // 1. Irish English ('en-IE') female voices (matching Kerry Condon's authentic voice)
    // 2. British English ('en-GB') female voices (Google UK English Female, Hazel, Susan, Serena, Sonia)
    // 3. Crisp modern English female voices (en-US, en-AU, en-CA, etc.)
    const irishVoice = voices.find(v => 
      v.lang.toLowerCase().includes('en-ie') || 
      /irish|moira|orla|kerry/i.test(v.name)
    );

    const britishFemale = voices.find(v => 
      v.lang.toLowerCase().includes('en-gb') && 
      /female|hazel|susan|serena|victoria|sonia|fiona|george|google uk/i.test(v.name)
    );

    const genericBritish = voices.find(v => v.lang.toLowerCase().includes('en-gb'));

    const englishFemale = voices.find(v => 
      v.lang.toLowerCase().startsWith('en') && 
      /female|samantha|zira|jenny|aria|ava|google/i.test(v.name)
    );

    const anyEnglish = voices.find(v => v.lang.toLowerCase().startsWith('en'));

    this.voice = irishVoice || britishFemale || genericBritish || englishFemale || anyEnglish || voices[0];
    this.initialized = true;
  }

  getAvailableVoices() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
    return window.speechSynthesis.getVoices();
  }

  setCustomVoice(voiceName) {
    const voices = this.getAvailableVoices();
    const found = voices.find(v => v.name === voiceName);
    if (found) {
      this.voice = found;
      this.selectedVoiceName = found.name;
    }
  }

  speak(text, { pitch = 1.08, rate = 1.03, delayMs = 120, urgency = 'normal' } = {}) {
    if (this.muted) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    // Ensure voices are populated
    if (!this.voice) {
      this.initVoices();
    }

    try {
      window.speechSynthesis.cancel(); // Stop any pending speech
    } catch (e) {}

    // Play Stark HUD audio chirp first
    this.playStarkChirp();

    setTimeout(() => {
      if (this.muted) return;

      const utterance = new SpeechSynthesisUtterance(text);
      if (this.voice) {
        utterance.voice = this.voice;
      }

      // Voice tuning for F.R.I.D.A.Y.'s crisp, composed AI cadence
      utterance.pitch = urgency === 'alert' ? pitch * 0.95 : pitch;
      utterance.rate = urgency === 'alert' ? rate * 1.05 : rate;
      utterance.volume = 1.0;

      utterance.onstart = () => {
        this.isSpeaking = true;
        this.currentSubtitle = text;
        if (this.onSubtitleChange) {
          this.onSubtitleChange({ text, isSpeaking: true, urgency });
        }
      };

      utterance.onend = () => {
        this.isSpeaking = false;
        if (this.onSubtitleChange) {
          this.onSubtitleChange({ text: '', isSpeaking: false, urgency: 'normal' });
        }
      };

      utterance.onerror = () => {
        this.isSpeaking = false;
        if (this.onSubtitleChange) {
          this.onSubtitleChange({ text: '', isSpeaking: false, urgency: 'normal' });
        }
      };

      try {
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn('[F.R.I.D.A.Y. Voice] Speech error:', err);
      }
    }, delayMs);
  }

  /**
   * Welcome phrase when multi-authenticator grants access and vault deadbolt unlocks
   */
  speakWelcome(name = 'Operator') {
    const cleanName = (name || 'Operator').trim();
    const phrases = [
      `Welcome, ${cleanName}. Multi-authenticator verified. Vault deadbolt retracted. All confidential files and root keys are at your disposal.`,
      `Good day, ${cleanName}. Biometric telemetry confirmed. Access granted. Vault directory is fully unlocked.`,
      `Identity verified. Welcome back, ${cleanName}. Actuator disengaged. Secure files are now decrypted.`
    ];
    // Deterministic or pleasant choice
    const phrase = phrases[Math.floor(Math.random() * phrases.length)];
    this.speak(phrase, { pitch: 1.08, rate: 1.02, delayMs: 250, urgency: 'normal' });
  }

  /**
   * Warning phrase when pulse sensor waveform morphology does not match enrolled operator
   */
  speakBiometricMismatch(targetName = '') {
    const target = targetName ? targetName.trim() : '';
    const text = target
      ? `Warning: Biometric waveform mismatch detected. Pulse morphology does not match ${target}. Access denied. Deadbolt remains locked.`
      : `Warning: Biometric mismatch detected. Unrecognized pulse wave morphology. Access denied. Actuator sealed.`;

    this.speak(text, { pitch: 1.02, rate: 1.05, delayMs: 150, urgency: 'alert' });
  }

  /**
   * Warning phrase when wrong Vault PIN is entered
   */
  speakWrongPin(remainingAttempts = null) {
    let text = `Security alert: Invalid vault security PIN. Verification unsuccessful.`;
    if (remainingAttempts !== null && remainingAttempts !== undefined && remainingAttempts > 0) {
      text += ` ${remainingAttempts} attempt${remainingAttempts > 1 ? 's' : ''} remaining before lockout.`;
    }
    this.speak(text, { pitch: 1.02, rate: 1.05, delayMs: 150, urgency: 'alert' });
  }

  /**
   * Alert phrase when account is locked out due to multiple security failures
   */
  speakLockout(seconds = 300) {
    const mins = Math.ceil(seconds / 60);
    const text = `Security protocol initiated: Maximum authentication attempts exceeded. Vault locked down for ${mins} minutes. Physical actuator sealed.`;
    this.speak(text, { pitch: 0.98, rate: 1.04, delayMs: 150, urgency: 'alert' });
  }

  /**
   * Notification phrase when vault is relocked
   */
  speakRelock(name = '') {
    const cleanName = name ? name.trim() : '';
    const text = cleanName
      ? `Vault secured. Deadbolt engaged, ${cleanName}. Standing by.`
      : `Vault secured. Deadbolt engaged. Standing by.`;
    this.speak(text, { pitch: 1.06, rate: 1.04, delayMs: 150, urgency: 'normal' });
  }

  stop() {
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    } catch (e) {}
    this.isSpeaking = false;
    if (this.onSubtitleChange) {
      this.onSubtitleChange({ text: '', isSpeaking: false, urgency: 'normal' });
    }
  }
}

export const fridayVoice = new FridayVoiceEngine();
