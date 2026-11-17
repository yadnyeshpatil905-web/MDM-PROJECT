// Genuine Arduino Serial Stream Parser
// Decodes lines sent by the physical Arduino UNO sketch in real time

export function parseArduinoSerialLine(line, currentState) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const updates = { rawLine: trimmed };

  // 1. Raw Telemetry / Real ADC Waveform Stream from HW-827 Pulse Sensor
  // Matches "RAW:512,AC:24" or "RAW:580" or "AC:32" or "PULSE:512"
  if (trimmed.startsWith('RAW:') || trimmed.startsWith('PPG:') || trimmed.startsWith('PULSE:')) {
    const parts = trimmed.split(',');
    let val = 512;
    let ac = 0;
    parts.forEach(p => {
      if (p.startsWith('RAW:') || p.startsWith('PPG:') || p.startsWith('PULSE:')) {
        val = parseInt(p.split(':')[1], 10) || 512;
      } else if (p.startsWith('AC:')) {
        ac = parseInt(p.split(':')[1], 10) || 0;
      }
    });
    updates.waveSample = { val, ac, isPeak: false, pulse: val };
    updates.pulseSample = { raw: val, ac };
    return updates;
  }

  // Fallback for legacy dual waveform stream if present
  if (trimmed.includes('RED') && trimmed.includes('IR')) {
    const redMatch = trimmed.match(/RED[=:]\s*(\d+)/i);
    const irMatch = trimmed.match(/IR[=:]\s*(\d+)/i);
    if (redMatch && irMatch) {
      const red = parseInt(redMatch[1], 10);
      const ir = parseInt(irMatch[1], 10);
      updates.pulseSample = { raw: Math.round(red / 100), ac: Math.round((red % 1000) - 500) };
      updates.waveSample = { val: Math.round(red / 100), ac: Math.round((red % 1000) - 500), isPeak: false };
      return updates;
    }
  }


  // 2. Finger Detection & Signal Amplitude from Arduino detectFinger()
  // "Signal amplitude = 42"
  if (trimmed.includes('Signal amplitude =')) {
    const amp = parseInt(trimmed.replace(/[^0-9]/g, ''), 10);
    updates.signalAmplitude = amp;
    updates.signalQuality = amp >= 15 ? 'GOOD' : 'WEAK';
  }

  // "NO FINGER / NO SIGNAL"
  if (trimmed.includes('NO FINGER') || trimmed.includes('NO SIGNAL')) {
    updates.state = 'IDLE';
    updates.statusMessage = 'WAITING FOR FINGER • PLACE FINGER ON HW-827 PULSE SENSOR';
    updates.lcdLine1 = 'ACCESS LOCKED';
    updates.lcdLine2 = 'PLACE FINGER';
    updates.signalQuality = 'WEAK';
  }

  // "PPG SIGNAL DETECTED" or "CAPTURING..."
  if (trimmed.includes('PPG SIGNAL DETECTED') || trimmed.includes('CAPTURING...')) {
    updates.state = 'CAPTURING';
    updates.statusMessage = 'FINGER DETECTED ON HW-827 SENSOR • CAPTURING PPG SIGNAL...';
    updates.lcdLine1 = 'CAPTURING PPG';
    updates.lcdLine2 = 'KEEP STILL';
    updates.signalQuality = 'GOOD';
    updates.isRunning = true;
  }

  // 3. Beat Detection & Timing from Arduino processPPG()
  // "FIRST BEAT"
  if (trimmed.includes('FIRST BEAT')) {
    updates.beatCount = 1;
    updates.validIntervals = 0;
    updates.wavePeakTrigger = true;
    updates.statusMessage = 'RECORDING HEARTBEATS: 1 BEAT DETECTED';
  }

  // "BEAT 3 IBI=810"
  if (trimmed.startsWith('BEAT ') && trimmed.includes('IBI=')) {
    const match = trimmed.match(/BEAT\s+(\d+)\s+IBI=(\d+)/i);
    if (match) {
      const beatNum = parseInt(match[1], 10);
      const ibi = parseInt(match[2], 10);
      updates.beatCount = beatNum;
      updates.lastIbi = ibi;
      updates.bpm = Math.round(60000 / ibi);
      updates.wavePeakTrigger = true;
      updates.validIntervals = (currentState.validIntervals || 0) + 1;
      updates.statusMessage = `RECORDING HEARTBEATS: ${beatNum} BEATS (IBI: ${ibi}ms)`;
    }
  }

  // "PPG BEAT USED = 2"
  if (trimmed.includes('PPG BEAT USED =')) {
    const beatsUsed = parseInt(trimmed.replace(/[^0-9]/g, ''), 10);
    updates.templateBeats = beatsUsed;
  }

  // 4. Capture Completion & Heart Rate from Arduino capturePPG()
  // "HEART RATE = 74 BPM" or "BPM = 74"
  if (trimmed.includes('HEART RATE =') || trimmed.startsWith('BPM =')) {
    const bpmVal = parseInt(trimmed.replace(/[^0-9]/g, ''), 10);
    if (bpmVal > 0) {
      updates.bpm = bpmVal;
      updates.lcdLine1 = `HEART RATE: ${bpmVal}`;
    }
  }

  // "VERIFYING BIOMETRIC..."
  if (trimmed.includes('VERIFYING BIOMETRIC...') || trimmed.includes('VERIFYING')) {
    updates.state = 'VERIFYING_BIOMETRIC';
    updates.statusMessage = 'ANALYZING BIOMETRIC TEMPLATE WITH EEPROM...';
    updates.lcdLine1 = 'VERIFYING';
    updates.lcdLine2 = 'BIOMETRIC...';
  }

  // 5. Template Extraction from Arduino
  if (trimmed.startsWith('TEMPLATE:[') && trimmed.endsWith(']')) {
    try {
      const jsonArr = JSON.parse(trimmed.replace('TEMPLATE:', ''));
      if (Array.isArray(jsonArr) && jsonArr.length === 20) {
        updates.currentTemplate = jsonArr;
      }
    } catch (e) {
      console.warn('Failed to parse serial template vector:', e);
    }
  }

  // Template Match Score from Arduino compareTemplates()
  // "MATCH = 89%"
  if (trimmed.includes('MATCH =')) {
    const scoreVal = parseInt(trimmed.replace(/[^0-9]/g, ''), 10);
    updates.matchScore = scoreVal;
    updates.lcdLine2 = `MATCH: ${scoreVal}%`;
  }

  // Two-Step Step 1 Passed -> PIN Required
  if (trimmed.includes('AWAITING_PIN_CMD') || trimmed.includes('BIO VERIFIED')) {
    updates.state = 'PIN_REQUIRED';
    updates.statusMessage = 'BIOMETRIC VERIFIED â€¢ VAULT PIN REQUIRED ON WEB CONSOLE';
    updates.lcdLine1 = 'BIO VERIFIED';
    updates.lcdLine2 = 'ENTER PIN';
  }

  // 6. Access Granted from Arduino grantAccess() (triggered by host CMD:UNLOCK)
  // "ACCESS GRANTED" or "ACK:UNLOCK:SUCCESS"
  if (trimmed.includes('ACCESS GRANTED') || trimmed.includes('ACK:UNLOCK:SUCCESS')) {
    updates.state = 'ACCESS_GRANTED';
    updates.statusMessage = 'IDENTITY VERIFIED â€¢ ACCESS GRANTED (SERVO UNLOCKED 90Â°)';
    updates.servoAngle = 90;
    updates.ledStatus = true;
    updates.lcdLine1 = 'ACCESS GRANTED';
    updates.isGenuineHardwareEvent = true;
  }

  // 7. Access Denied from Arduino denyAccess()
  // "ACCESS DENIED: NO MATCH" or "ACCESS DENIED: BAD SIGNAL" or "PIN TIMEOUT"
  if (trimmed.includes('ACCESS DENIED')) {
    const reason = trimmed.split(':')[1] ? trimmed.split(':')[1].trim() : 'NO MATCH';
    updates.state = 'ACCESS_DENIED';
    updates.statusMessage = `ACCESS DENIED: ${reason} (SERVO LOCKED 0Â°)`;
    updates.servoAngle = 0;
    updates.ledStatus = false;
    updates.lcdLine1 = 'ACCESS DENIED';
    updates.lcdLine2 = reason;
    updates.isGenuineHardwareEvent = true;
  }

  // 8. System Reset to Locked from Arduino showLocked()
  // "SYSTEM READY - LOCKED" or "SYSTEM LOCKED"
  if (trimmed.includes('SYSTEM READY - LOCKED') || trimmed.includes('SYSTEM LOCKED')) {
    updates.state = 'IDLE';
    updates.servoAngle = 0;
    updates.ledStatus = false;
    updates.statusMessage = 'SYSTEM READY â€¢ PLACE FINGER ON SENSOR';
    updates.lcdLine1 = 'ACCESS LOCKED';
    updates.lcdLine2 = 'PLACE FINGER';
    updates.isRunning = false;
  }

  // 9. Enrollment Mode
  if (trimmed.includes('BIOMETRIC ENROLLMENT') || trimmed.includes('ENROLL MODE') || trimmed.includes('MODE:ENROLL_ACTIVE') || trimmed.includes('SYSTEM IN ENROLL MODE')) {
    updates.mode = 'ENROLLMENT';
    updates.statusMessage = 'ENROLLMENT MODE • PLACE FINGER ON HW-827 PULSE SENSOR';
    updates.lcdLine1 = 'BIOMETRIC';
    updates.lcdLine2 = 'PLACE FINGER';
  }

  if (trimmed.includes('MODE:AUTH_ACTIVE')) {
    updates.mode = 'AUTHENTICATION';
  }

  if (trimmed.includes('ENROLLMENT SUCCESS') || trimmed.includes('TEMPLATE SAVED')) {
    updates.state = 'ACCESS_GRANTED';
    updates.statusMessage = 'BIOMETRIC ENROLLMENT SUCCESSFUL â€¢ TEMPLATE COMMITTED TO EEPROM';
    updates.lcdLine1 = 'ENROLLMENT';
    updates.lcdLine2 = 'SUCCESS';
    updates.ledStatus = true;
  }

  return updates;
}
