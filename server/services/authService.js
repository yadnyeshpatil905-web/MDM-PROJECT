import { CryptoService } from './cryptoService.js';
import { BiometricService } from './biometricService.js';
import { deviceService } from './deviceService.js';
import { repository } from '../repositories/index.js';
import { 
  DEFAULT_CONFIG, 
  BIOMETRIC_RESULTS, 
  PIN_RESULTS, 
  FINAL_RESULTS, 
  VAULT_EVENT_TYPES 
} from '../models/constants.js';

export class AuthService {
  constructor() {
    // In-memory active biometric challenges: challengeId -> { userId, expiresAt, score, consumed }
    this.activeChallenges = new Map();
    // User lockouts: userId -> lockoutUntilTimestamp
    this.userLockouts = new Map();
    // Active authenticated sessions: token -> { userId, email, expiresAt }
    this.activeSessions = new Map();
    // Configuration options
    this.config = { ...DEFAULT_CONFIG };
  }

  updateConfig(newConfig = {}) {
    if (newConfig.matchThreshold !== undefined) {
      this.config.MATCH_THRESHOLD = Math.max(50, Math.min(95, Number(newConfig.matchThreshold)));
    }
    if (newConfig.pinMaxAttempts !== undefined) {
      this.config.PIN_MAX_ATTEMPTS = Math.max(1, Math.min(10, Number(newConfig.pinMaxAttempts)));
    }
    if (newConfig.challengeTtlSec !== undefined) {
      this.config.CHALLENGE_TTL_SEC = Math.max(30, Math.min(300, Number(newConfig.challengeTtlSec)));
    }
    if (newConfig.autoLockDurationSec !== undefined) {
      this.config.AUTO_LOCK_DURATION_SEC = Math.max(2, Math.min(60, Number(newConfig.autoLockDurationSec)));
    }
    if (newConfig.lockoutDurationSec !== undefined) {
      this.config.PIN_LOCKOUT_DURATION_SEC = Math.max(60, Math.min(3600, Number(newConfig.lockoutDurationSec)));
    }
    return this.config;
  }

  getConfig() {
    return { ...this.config };
  }

  /**
   * Session Management for Authenticated Operations
   */
  createSession(userId, email = null, ttlSec = 3600) {
    const token = CryptoService.generateChallengeToken();
    const expiresAt = Date.now() + (ttlSec * 1000);
    const session = {
      token,
      userId,
      email,
      expiresAt
    };
    this.activeSessions.set(token, session);
    return session;
  }

  verifySession(token) {
    if (!token) return null;
    const session = this.activeSessions.get(token);
    if (!session) return null;

    if (Date.now() > session.expiresAt) {
      this.activeSessions.delete(token);
      return null;
    }

    return session;
  }

  revokeSession(token) {
    return this.activeSessions.delete(token);
  }

  /**
   * User Registration & Biometric Enrollment Flow
   * Supports both 20-point morphology template and raw HW-827 Pulse Sensor waveform.
   */
  async registerUser({ fullName, email, password, pin, pinConfirm, templateData, rawRecording = null }) {
    // 1. Validate Full Name
    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
      throw new Error('Full Name must be at least 2 characters.');
    }

    // 2. Validate Email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email.trim())) {
      throw new Error('A valid email address is required.');
    }
    const cleanEmail = email.trim().toLowerCase();

    // Check unique email
    const existing = await repository.findProfileByEmail(cleanEmail);
    if (existing) {
      throw new Error(`An account with email ${cleanEmail} is already registered.`);
    }

    // 3. Validate Account Password (minimum 8 chars for Supabase Auth)
    if (!password || typeof password !== 'string' || password.length < 8) {
      throw new Error('Account password must be at least 8 characters long.');
    }

    // 4. Validate Vault PIN and Confirmation
    if (!pin || typeof pin !== 'string') {
      throw new Error('Vault PIN is required.');
    }
    const pinRegex = /^[0-9]{4,8}$/;
    if (!pinRegex.test(pin)) {
      throw new Error('Vault PIN must be 4 to 8 numeric digits.');
    }
    if (pin !== pinConfirm) {
      throw new Error('Vault PIN and Confirmation PIN do not match.');
    }

    // 5. Require Successful Biometric Enrollment before finalizing
    const templateValidation = BiometricService.validateTemplate(templateData);
    if (!templateValidation.valid) {
      throw new Error(`Biometric enrollment failed: ${templateValidation.error}`);
    }

    // 5b. Validate optional raw HW-827 Pulse Sensor biometric recording if supplied
    let rawValidationStats = null;
    if (rawRecording) {
      const valRaw = BiometricService.validateRawRecording(rawRecording);
      if (!valRaw.valid) {
        throw new Error(`Raw HW-827 Pulse Sensor waveform enrollment failed: ${valRaw.error}`);
      }
      rawValidationStats = valRaw.stats;
    }

    // 6. Generate immutable User ID (Supabase Auth uuid)
    const userId = CryptoService.generateId();

    // 7. Store Profile
    const profile = await repository.createProfile({
      id: userId,
      full_name: fullName.trim(),
      email: cleanEmail,
      password: password
    });

    const finalUserId = profile.id || userId;

    // 8. Hash Vault PIN (never store raw PIN)
    const pinHash = CryptoService.hashPin(pin);
    await repository.createVaultCredential({
      user_id: finalUserId,
      pin_hash: pinHash
    });

    // 9. Store Biometric Template associated with user ID
    await repository.createBiometricCredential({
      user_id: finalUserId,
      template_data: templateData,
      template_version: 'v1.0-morphology-20',
      status: 'active'
    });

    // 9b. Store Raw HW-827 Pulse Sensor Biometric Recording if provided
    let rawRecordingId = null;
    if (rawRecording) {
      try {
        const savedRecording = await repository.createBiometricRecording({
          user_id: finalUserId,
          pulse_samples: rawRecording.pulse_samples || rawRecording.raw_samples || rawRecording.red_samples,
          raw_samples: rawRecording.raw_samples || rawRecording.pulse_samples || rawRecording.red_samples,
          red_samples: rawRecording.red_samples || rawRecording.pulse_samples,
          ir_samples: rawRecording.ir_samples || rawRecording.pulse_samples,
          sample_rate: rawRecording.sample_rate,
          sample_count: rawRecording.sample_count,
          device_info: rawRecording.device_info || 'HW-827 Pulse Sensor'
        });
        rawRecordingId = savedRecording.id;
      } catch (recErr) {
        console.warn('[AuthService] createBiometricRecording notice (run 20261029000000_add_biometric_recordings.sql in Supabase):', recErr.message);
      }
    }

    // 10. Record enrollment in audit logs
    await repository.createAuthAttempt({
      user_id: finalUserId,
      biometric_result: BIOMETRIC_RESULTS.SUCCESS,
      pin_result: PIN_RESULTS.NOT_REQUIRED,
      final_result: FINAL_RESULTS.SUCCESS,
      failure_reason: rawRecording 
        ? 'Initial Registration, Biometric Template & Raw HW-827 Pulse Sensor Waveform Enrolled'
        : 'Initial Registration & Biometric Enrollment Completed'
    });

    // Generate authenticated session for newly registered operator
    const session = this.createSession(finalUserId, cleanEmail);

    return {
      success: true,
      userId: finalUserId,
      fullName: profile.full_name,
      email: profile.email,
      created_at: profile.created_at,
      sessionToken: session.token,
      rawRecordingEnrolled: Boolean(rawRecordingId),
      rawRecordingId,
      rawValidationStats
    };
  }

  /**
   * Enrolls a raw HW-827 Pulse Sensor PPG waveform recording for an authenticated user.
   * Requires verified identity from trusted middleware.
   */
  async enrollRawBiometricRecording({ userId, rawRecording }) {
    if (!userId) {
      throw new Error('Authenticated user ID is required.');
    }

    const profile = await repository.findProfileById(userId);
    if (!profile) {
      throw new Error('User profile not found for authenticated ID.');
    }

    const validation = BiometricService.validateRawRecording(rawRecording);
    if (!validation.valid) {
      throw new Error(`Raw recording validation failed: ${validation.error}`);
    }

    const recording = await repository.createBiometricRecording({
      user_id: userId,
      pulse_samples: rawRecording.pulse_samples || rawRecording.raw_samples || rawRecording.red_samples,
      raw_samples: rawRecording.raw_samples || rawRecording.pulse_samples || rawRecording.red_samples,
      red_samples: rawRecording.red_samples || rawRecording.pulse_samples,
      ir_samples: rawRecording.ir_samples || rawRecording.pulse_samples,
      sample_rate: rawRecording.sample_rate,
      sample_count: rawRecording.sample_count,
      device_info: rawRecording.device_info || 'HW-827 Pulse Sensor'
    });

    await repository.createAuthAttempt({
      user_id: userId,
      biometric_result: BIOMETRIC_RESULTS.SUCCESS,
      pin_result: PIN_RESULTS.NOT_REQUIRED,
      final_result: FINAL_RESULTS.SUCCESS,
      failure_reason: `Raw HW-827 Pulse Sensor PPG Waveform Enrolled (${rawRecording.sample_count} samples @ ${rawRecording.sample_rate}Hz)`
    });

    return {
      success: true,
      recordingId: recording.id,
      userId,
      stats: validation.stats,
      recordedAt: recording.recorded_at,
      message: 'Raw HW-827 Pulse Sensor PPG waveform recording successfully enrolled and stored in public.biometric_recordings.'
    };
  }

  /**
   * Retrieves summary of raw biometric recordings for an authenticated user.
   * Never exposes raw arrays to unprivileged calls.
   */
  async listUserRecordings(userId, options = {}) {
    if (!userId) throw new Error('User ID is required.');
    const recordings = await repository.listBiometricRecordingsByUserId(userId, options);
    // Return sanitized metadata
    return recordings.map(r => ({
      id: r.id,
      userId: r.user_id,
      sampleRate: r.sample_rate,
      sampleCount: r.sample_count,
      deviceInfo: r.device_info,
      recordedAt: r.recorded_at,
      hasRedData: Array.isArray(r.red_samples) && r.red_samples.length > 0,
      hasIrData: Array.isArray(r.ir_samples) && r.ir_samples.length > 0
    }));
  }

  /**
   * Two-Step Authentication - Step 1: Biometric Verification

   * Verifies live biometric sample and yields a short-lived challenge token.
   * DOES NOT OPEN THE VAULT.
   */
  async verifyBiometric({ userId, sampleTemplate, isHardwareSample = false }) {
    if (!userId) {
      throw new Error('User selection is required for biometric authentication.');
    }

    // Check account lockout
    const lockoutUntil = this.userLockouts.get(userId);
    if (lockoutUntil && Date.now() < lockoutUntil) {
      const remainingSec = Math.ceil((lockoutUntil - Date.now()) / 1000);
      await repository.createAuthAttempt({
        user_id: userId,
        biometric_result: BIOMETRIC_RESULTS.FAILURE,
        pin_result: PIN_RESULTS.FAILURE,
        final_result: FINAL_RESULTS.DENIED,
        failure_reason: `Account is temporarily locked out (${remainingSec}s remaining).`
      });
      return {
        success: false,
        lockedOut: true,
        remainingSec,
        failureReason: `Account locked due to excessive failed attempts. Try again in ${remainingSec}s.`
      };
    }

    // Find profile
    const profile = await repository.findProfileById(userId);
    if (!profile) {
      throw new Error('User account not found.');
    }

    // Retrieve enrolled template
    const credential = await repository.findBiometricCredentialByUserId(userId);
    if (!credential || !credential.template_data) {
      await repository.createAuthAttempt({
        user_id: userId,
        biometric_result: BIOMETRIC_RESULTS.UNAVAILABLE,
        pin_result: PIN_RESULTS.NOT_REQUIRED,
        final_result: FINAL_RESULTS.DENIED,
        failure_reason: 'No active biometric credential found for account.'
      });
      return {
        success: false,
        failureReason: 'No enrolled biometric credential found for this account.'
      };
    }

    // Compare morphological curves
    try {
      const matchResult = BiometricService.compareTemplates(sampleTemplate, credential.template_data);
      
      if (!matchResult.matched || matchResult.score < this.config.MATCH_THRESHOLD) {
        // Biometric verification failed
        await repository.createAuthAttempt({
          user_id: userId,
          biometric_result: BIOMETRIC_RESULTS.FAILURE,
          pin_result: PIN_RESULTS.NOT_REQUIRED,
          final_result: FINAL_RESULTS.DENIED,
          failure_reason: `Biometric mismatch (${matchResult.score}% < ${this.config.MATCH_THRESHOLD}% threshold).`
        });

        return {
          success: false,
          score: matchResult.score,
          threshold: this.config.MATCH_THRESHOLD,
          isHardwareSample,
          failureReason: `Biometric mismatch: score ${matchResult.score}% is below required threshold ${this.config.MATCH_THRESHOLD}%.`
        };
      }

      // Biometric Verified! Generate Step 2 Challenge Token
      const challengeId = CryptoService.generateChallengeToken();
      const expiresAt = Date.now() + (this.config.CHALLENGE_TTL_SEC * 1000);

      this.activeChallenges.set(challengeId, {
        userId,
        expiresAt,
        score: matchResult.score,
        consumed: false
      });

      return {
        success: true,
        challengeId,
        userId,
        fullName: profile.full_name,
        score: matchResult.score,
        threshold: this.config.MATCH_THRESHOLD,
        expiresInSec: this.config.CHALLENGE_TTL_SEC,
        isHardwareSample,
        message: 'Biometric verification passed. Vault PIN required for authorization.'
      };
    } catch (err) {
      await repository.createAuthAttempt({
        user_id: userId,
        biometric_result: BIOMETRIC_RESULTS.FAILURE,
        pin_result: PIN_RESULTS.NOT_REQUIRED,
        final_result: FINAL_RESULTS.DENIED,
        failure_reason: `Sensor acquisition error: ${err.message}`
      });

      return {
        success: false,
        failureReason: `Sensor error: ${err.message}`
      };
    }
  }

  /**
   * Two-Step Authentication - Step 2: Vault PIN Verification
   * Verifies PIN against stored salted hash for an active, unexpired challenge.
   * Vault opens ONLY if this succeeds!
   */
  async verifyPin({ challengeId, pin }) {
    if (!challengeId || typeof challengeId !== 'string') {
      throw new Error('Valid biometric challenge token is required.');
    }
    if (!pin || typeof pin !== 'string') {
      throw new Error('Vault PIN is required.');
    }

    // 1. Look up Challenge Token
    const challenge = this.activeChallenges.get(challengeId);
    if (!challenge) {
      return {
        success: false,
        failureReason: 'Invalid or missing biometric challenge session. Please restart biometric scan.',
        expired: true
      };
    }

    // 2. Check Expiry
    if (Date.now() > challenge.expiresAt) {
      this.activeChallenges.delete(challengeId);
      return {
        success: false,
        failureReason: 'Biometric challenge expired. Biometric session is valid for 90 seconds only.',
        expired: true
      };
    }

    // 3. Check if already consumed (One-time use)
    if (challenge.consumed) {
      return {
        success: false,
        failureReason: 'Biometric challenge has already been consumed. Replay rejected.',
        expired: true
      };
    }

    const { userId } = challenge;

    // 4. Check Lockout State
    const lockoutUntil = this.userLockouts.get(userId);
    if (lockoutUntil && Date.now() < lockoutUntil) {
      const remainingSec = Math.ceil((lockoutUntil - Date.now()) / 1000);
      return {
        success: false,
        lockedOut: true,
        remainingSec,
        failureReason: `Too many failed PIN attempts. Account locked for ${remainingSec}s.`
      };
    }

    // 5. Retrieve Vault Credential (Salted Hash)
    const vaultCred = await repository.findVaultCredentialByUserId(userId);
    if (!vaultCred) {
      return {
        success: false,
        failureReason: 'No vault credential configured for this account.'
      };
    }

    // 6. Verify PIN in constant time
    const pinValid = CryptoService.verifyPin(pin, vaultCred.pin_hash);

    if (!pinValid) {
      // Record failed PIN attempt
      await repository.createAuthAttempt({
        user_id: userId,
        biometric_result: BIOMETRIC_RESULTS.SUCCESS,
        pin_result: PIN_RESULTS.FAILURE,
        final_result: FINAL_RESULTS.DENIED,
        failure_reason: 'Incorrect Vault PIN'
      });

      // Calculate recent failed attempts
      const recentFails = await repository.countRecentFailedPinAttempts(userId, this.config.PIN_LOCKOUT_DURATION_SEC);
      const remainingAttempts = Math.max(0, this.config.PIN_MAX_ATTEMPTS - recentFails);

      if (remainingAttempts === 0) {
        // Trigger Temporary Lockout
        const lockUntil = Date.now() + (this.config.PIN_LOCKOUT_DURATION_SEC * 1000);
        this.userLockouts.set(userId, lockUntil);
        this.activeChallenges.delete(challengeId);

        await repository.createVaultEvent({
          user_id: userId,
          event_type: VAULT_EVENT_TYPES.LOCKOUT
        });

        return {
          success: false,
          lockedOut: true,
          remainingAttempts: 0,
          remainingSec: this.config.PIN_LOCKOUT_DURATION_SEC,
          failureReason: `Maximum PIN attempts exceeded. Account locked out for ${this.config.PIN_LOCKOUT_DURATION_SEC / 60} minutes.`
        };
      }

      return {
        success: false,
        remainingAttempts,
        failureReason: `Incorrect Vault PIN. ${remainingAttempts} attempt(s) remaining before lockout.`
      };
    }

    // 7. PIN Verified Successfully!
    // Consume challenge token so it cannot be reused
    challenge.consumed = true;
    this.activeChallenges.delete(challengeId);

    // Clear any lockout history
    this.userLockouts.delete(userId);

    // Record complete authentication grant
    await repository.createAuthAttempt({
      user_id: userId,
      biometric_result: BIOMETRIC_RESULTS.SUCCESS,
      pin_result: PIN_RESULTS.SUCCESS,
      final_result: FINAL_RESULTS.SUCCESS,
      failure_reason: null
    });

    // 8. Command hardware actuator via trusted device service
    const unlockResult = await deviceService.executeAuthorizedUnlock(userId);

    // Generate authenticated session authorization token
    const session = this.createSession(userId);

    return {
      success: true,
      authorizationToken: session.token,
      sessionToken: session.token,
      vaultStatus: 'UNLOCKED',
      servoAngle: unlockResult.servoAngle,
      autoLockInSeconds: unlockResult.autoLockInSeconds,
      message: 'Two-step authentication authorized. Vault unlocked.'
    };
  }

  /**
   * Account login for operator session issuance
   */
  async loginUser({ email, password }) {
    if (!email || !password) {
      throw new Error('Email and password are required.');
    }
    const cleanEmail = email.trim().toLowerCase();
    const profile = await repository.findProfileByEmail(cleanEmail);
    if (!profile) {
      throw new Error('Account not found with provided email.');
    }

    // Generate authenticated session
    const session = this.createSession(profile.id, cleanEmail);

    return {
      success: true,
      userId: profile.id,
      fullName: profile.full_name,
      email: profile.email,
      sessionToken: session.token,
      message: 'Operator session authenticated.'
    };
  }
}


export const authService = new AuthService();
