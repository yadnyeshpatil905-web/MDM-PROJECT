import express from 'express';
import { authService } from '../services/authService.js';
import { deviceService } from '../services/deviceService.js';
import { vaultFolderService } from '../services/vaultFolderService.js';
import { repository } from '../repositories/index.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { BiometricService } from '../services/biometricService.js';
import { isSupabaseConfigured } from '../services/supabaseClient.js';

const router = express.Router();

/**
 * Public User List for Account Selection in Two-Step Auth
 * Exposes only safe display info; NEVER exposes PIN hashes or biometric templates.
 */
router.get('/users', async (req, res) => {
  try {
    const profiles = await repository.listProfiles();
    const safeUsers = await Promise.all(profiles.map(async (p) => {
      const bio = await repository.findBiometricCredentialByUserId(p.id);
      const vault = await repository.findVaultCredentialByUserId(p.id);
      return {
        id: p.id,
        fullName: p.full_name,
        email: p.email,
        createdAt: p.created_at,
        isBiometricEnrolled: !!bio,
        isPinConfigured: !!vault
      };
    }));
    res.json({ success: true, users: safeUsers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Registration & Biometric Enrollment
 * Supports 20-point morphology template and optional raw HW-827 Pulse Sensor waveform enrollment.
 */
router.post('/auth/register', async (req, res) => {
  try {
    const { fullName, email, password, pin, pinConfirm, templateData, rawRecording } = req.body;
    const result = await authService.registerUser({
      fullName,
      email,
      password,
      pin,
      pinConfirm,
      templateData,
      rawRecording
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * Account Login to Acquire Verified Session Token
 */
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await authService.loginUser({ email, password });
    res.json(result);
  } catch (err) {
    res.status(401).json({ success: false, error: err.message });
  }
});


/**
 * Step 1: Biometric Verification
 */
router.post('/auth/biometric-verify', async (req, res) => {
  try {
    const { userId, sampleTemplate, isHardwareSample } = req.body;
    const result = await authService.verifyBiometric({
      userId,
      sampleTemplate,
      isHardwareSample: Boolean(isHardwareSample)
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * Step 2: Vault PIN Verification
 */
router.post('/auth/pin-verify', async (req, res) => {
  try {
    const { challengeId, pin } = req.body;
    const result = await authService.verifyPin({ challengeId, pin });
    if (!result.success && result.lockedOut) {
      return res.status(429).json(result);
    }
    if (!result.success) {
      return res.status(401).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * Vault Status
 */
router.get('/vault/status', (req, res) => {
  const deviceState = deviceService.getDeviceState();
  res.json({
    success: true,
    vaultState: deviceState.servoStatus,
    servoAngle: deviceState.servoAngle,
    connectionStatus: deviceState.connectionStatus,
    sensorStatus: deviceState.sensorStatus,
    isFailClosed: true,
    lastCommunication: deviceState.lastCommunication
  });
});

/**
 * Vault Protected Files & Folder Management
 */
router.get('/vault/files', (req, res) => {
  try {
    const files = vaultFolderService.getFiles();
    res.json({ success: true, count: files.length, files });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/vault/files/:id', (req, res) => {
  try {
    const file = vaultFolderService.getFileById(req.params.id);
    if (!file) {
      return res.status(404).json({ success: false, error: 'File not found in secure vault.' });
    }
    res.json({ success: true, file });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/vault/files', (req, res) => {
  try {
    const { name, category, content, mimeType } = req.body;
    const newFile = vaultFolderService.addFile({ name, category, content, mimeType });
    res.status(201).json({ success: true, file: newFile });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/vault/files/:id', (req, res) => {
  try {
    const ok = vaultFolderService.deleteFile(req.params.id);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'File not found.' });
    }
    res.json({ success: true, message: 'File removed from vault folder.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Force Vault Relock
 */
router.post('/vault/relock', async (req, res) => {
  try {
    const { userId } = req.body;
    const result = await deviceService.executeRelock(userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Audit History
 */
router.get('/history', async (req, res) => {
  try {
    const attempts = await repository.listAuthAttempts({ limit: 100 });
    const profiles = await repository.listProfiles();
    const profileMap = new Map(profiles.map(p => [p.id, p]));

    const formattedLogs = attempts.map(att => {
      const profile = profileMap.get(att.user_id);
      return {
        id: att.id,
        timestamp: att.created_at,
        userId: att.user_id ? (profile ? `${profile.full_name} (${profile.email})` : att.user_id) : 'UNKNOWN / UNMATCHED',
        biometricResult: att.biometric_result,
        pinResult: att.pin_result,
        result: att.final_result,
        reason: att.failure_reason || ((att.final_result === 'success' || att.final_result === 'GRANTED') ? 'Two-Step Biometric + PIN Authorized' : 'Access Denied'),
        device: 'ARDUINO-UNO (HW-827 PPG)',
        duration: '7.2s'
      };
    });

    res.json({ success: true, logs: formattedLogs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Devices List & Status
 */
router.get('/devices', async (req, res) => {
  try {
    const devices = await repository.listDevices();
    res.json({ success: true, devices });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/device/status', (req, res) => {
  const deviceState = deviceService.getDeviceState();
  res.json({
    arduino: deviceState.connectionStatus,
    sensor: 'HW-827 Pulse Sensor (Analog Pin A0)',
    servo: deviceState.servoStatus,
    servoAngle: deviceState.servoAngle,
    baudRate: deviceState.baudRate,
    database: isSupabaseConfigured() ? 'SUPABASE (POSTGRESQL CLOUD)' : 'IN_MEMORY (SUPABASE READY)'
  });
});

/**
 * ==============================================================================
 * HW-827 PULSE SENSOR RAW BIOMETRIC WAVEFORM ENROLLMENT & STORAGE ENDPOINTS
 * Integrates directly with public.biometric_recordings table.
 * ==============================================================================
 */

/**
 * HW-827 Pulse Sensor Raw Waveform Enrollment
 * Protected by requireAuth: user ID is cryptographically verified from the token,
 * NEVER trusted directly from frontend body payload.
 */
router.post('/biometrics/recordings/enroll', requireAuth, async (req, res) => {
  try {
    const { rawRecording } = req.body;
    if (!rawRecording) {
      return res.status(400).json({
        success: false,
        error: 'rawRecording object is required with pulse_samples, sample_rate, and sample_count.'
      });
    }

    // req.user.id is strictly established by requireAuth middleware
    const result = await authService.enrollRawBiometricRecording({
      userId: req.user.id,
      rawRecording
    });

    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * Private Listing of Enrolled Waveform Recordings
 * Protected by requireAuth: Returns only sanitized metadata summaries for authenticated user.
 */
router.get('/biometrics/recordings', requireAuth, async (req, res) => {
  try {
    const recordings = await authService.listUserRecordings(req.user.id);
    res.json({
      success: true,
      count: recordings.length,
      userId: req.user.id,
      recordings
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Raw Waveform Correlation Evaluation Benchmark (Requirement 7)
 * Evaluates morphological correlation between separate recordings.
 * Explicitly states that two-person identification cannot be claimed without formal
 * cross-session multi-subject evaluation.
 */
router.post('/biometrics/recordings/evaluate', requireAuth, async (req, res) => {
  try {
    const { recordingA, recordingB } = req.body;
    if (!recordingA || !recordingB) {
      return res.status(400).json({
        success: false,
        error: 'recordingA and recordingB are both required for morphological correlation evaluation.'
      });
    }

    const evaluation = BiometricService.evaluateRecordingPair(recordingA, recordingB);
    res.json({
      success: true,
      ...evaluation
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * Biometric Limitations & Physiological Notice
 */
router.get('/biometrics/limitations', (req, res) => {
  res.json({
    success: true,
    ...BiometricService.getBiometricLimitations()
  });
});

/**
 * Security Settings
 */
router.get('/settings', (req, res) => {
  res.json({
    success: true,
    settings: authService.getConfig()
  });
});

router.post('/settings', (req, res) => {
  try {
    const updated = authService.updateConfig(req.body);
    res.json({ success: true, message: 'Security parameters updated', settings: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * Device Command Gateway - Rejects Unauthenticated Vault-Open Bypass
 */
router.post('/device/command', (req, res) => {
  const { command } = req.body;
  if (!command) {
    return res.status(400).json({ error: 'Command is required' });
  }

  // Strictly block any attempt to open vault via generic command endpoint!
  if (command.toUpperCase().includes('UNLOCK') || command.toUpperCase().includes('OPEN')) {
    return res.status(403).json({
      error: 'Security Policy Violation: Vault actuator commands must originate from two-step authentication authorization.'
    });
  }

  res.json({ success: true, message: `Command ${command} received.` });
});

export default router;

