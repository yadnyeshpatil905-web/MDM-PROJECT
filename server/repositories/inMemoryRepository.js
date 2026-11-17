import { CryptoService } from '../services/cryptoService.js';
import { 
  IProfileRepository, 
  IBiometricRepository, 
  IVaultCredentialRepository, 
  IAuthAttemptRepository, 
  IVaultEventRepository, 
  IDeviceRepository,
  IBiometricRecordingRepository
} from './interface.js';
import { 
  BIOMETRIC_RESULTS, 
  PIN_RESULTS, 
  FINAL_RESULTS, 
  VAULT_EVENT_TYPES, 
  DEVICE_STATUS,
  CREDENTIAL_STATUS 
} from '../models/constants.js';

export class InMemoryRepositoryManager {
  constructor() {
    this.profiles = new Map();
    this.biometricCredentials = new Map();
    this.vaultCredentials = new Map();
    this.authenticationAttempts = [];
    this.vaultEvents = [];
    this.devices = new Map();
    this.biometricRecordings = new Map();

    this.seedDefaultData();
  }

  seedDefaultData() {
    // Seed initial demo profile: Alex Morgan
    const demoUserId = 'a0000000-0000-0000-0000-000000000001';
    const now = new Date().toISOString();

    this.profiles.set(demoUserId, {
      id: demoUserId,
      full_name: 'Alex Morgan',
      email: 'alex.morgan@biolock.internal',
      created_at: now
    });

    // Enrolled 20-point PPG morphological template
    const demoBiometricId = 'b0000000-0000-0000-0000-000000000001';
    this.biometricCredentials.set(demoBiometricId, {
      id: demoBiometricId,
      user_id: demoUserId,
      template_data: [
        35, 78, 142, 215, 255, 240, 195, 150, 120, 95,
        82, 105, 125, 110, 85, 65, 48, 38, 30, 25
      ],
      template_version: 'v1.0-morphology-20',
      enrolled_at: now,
      status: CREDENTIAL_STATUS.ACTIVE
    });

    // Salted Vault PIN (Default PIN: 1234)
    this.vaultCredentials.set(demoUserId, {
      user_id: demoUserId,
      pin_hash: CryptoService.hashPin('1234'),
      updated_at: now
    });

    // Registered hardware device
    const demoDeviceId = 'd0000000-0000-0000-0000-000000000001';
    this.devices.set(demoDeviceId, {
      id: demoDeviceId,
      user_id: demoUserId,
      device_name: 'ARDUINO-UNO-01 (HW-827 PPG)',
      connection_status: DEVICE_STATUS.CONNECTED,
      last_seen_at: now,
      created_at: now
    });

    // Seed audit history
    this.authenticationAttempts.push({
      id: 'c0000000-0000-0000-0000-000000000001',
      user_id: demoUserId,
      biometric_result: BIOMETRIC_RESULTS.SUCCESS,
      pin_result: PIN_RESULTS.SUCCESS,
      final_result: FINAL_RESULTS.SUCCESS,
      failure_reason: null,
      created_at: new Date(Date.now() - 3600000).toISOString()
    });

    this.vaultEvents.push({
      id: 'e0000000-0000-0000-0000-000000000001',
      user_id: demoUserId,
      event_type: VAULT_EVENT_TYPES.OPEN_AUTHORIZED,
      created_at: new Date(Date.now() - 3600000).toISOString()
    });

    // Seed initial Heart Sensor (Pulse Sensor) raw biometric recording
    const demoRecordingId = 'r0000000-0000-0000-0000-000000000001';
    const sampleCount = 100;
    const pulseSamples = [];
    for (let i = 0; i < sampleCount; i++) {
      const phase = (i % 20) / 20;
      const pulse = Math.exp(-Math.pow((phase - 0.2) / 0.08, 2)) * 280;
      const notch = Math.exp(-Math.pow((phase - 0.38) / 0.09, 2)) * 75;
      pulseSamples.push(Math.round(512 + pulse + notch + (Math.sin(i * 0.1) * 20)));
    }

    this.biometricRecordings.set(demoRecordingId, {
      id: demoRecordingId,
      user_id: demoUserId,
      pulse_samples: pulseSamples,
      raw_samples: pulseSamples,
      red_samples: pulseSamples,
      ir_samples: pulseSamples,
      sample_rate: 100,
      sample_count: sampleCount,
      device_info: 'Heart Sensor (Pulse Sensor)',
      recorded_at: now
    });
  }


  // --- Profile Repository Methods ---
  async createProfile({ id, full_name, email }) {
    const profileId = id || CryptoService.generateId();
    // Validate unique email
    for (const p of this.profiles.values()) {
      if (p.email.toLowerCase() === email.toLowerCase()) {
        throw new Error(`Profile with email ${email} already exists`);
      }
    }
    const profile = {
      id: profileId,
      full_name,
      email: email.toLowerCase().trim(),
      created_at: new Date().toISOString()
    };
    this.profiles.set(profileId, profile);
    return profile;
  }

  async findProfileById(id) {
    return this.profiles.get(id) || null;
  }

  async findProfileByEmail(email) {
    if (!email) return null;
    const search = email.toLowerCase().trim();
    for (const p of this.profiles.values()) {
      if (p.email === search) return p;
    }
    return null;
  }

  async listProfiles() {
    return Array.from(this.profiles.values());
  }

  // --- Biometric Credential Repository Methods ---
  async createBiometricCredential({ user_id, template_data, template_version = 'v1.0-morphology-20', status = CREDENTIAL_STATUS.ACTIVE }) {
    // Enforce unique user_id constraint matching schema
    for (const cred of this.biometricCredentials.values()) {
      if (cred.user_id === user_id) {
        cred.template_data = [...template_data];
        cred.template_version = template_version;
        cred.status = status;
        cred.enrolled_at = new Date().toISOString();
        return cred;
      }
    }

    const id = CryptoService.generateId();
    const cred = {
      id,
      user_id,
      template_data: [...template_data],
      template_version,
      enrolled_at: new Date().toISOString(),
      status
    };
    this.biometricCredentials.set(id, cred);
    return cred;
  }

  async findBiometricCredentialByUserId(user_id) {
    for (const cred of this.biometricCredentials.values()) {
      if (cred.user_id === user_id && cred.status === CREDENTIAL_STATUS.ACTIVE) {
        return cred;
      }
    }
    return null;
  }

  async revokeBiometricCredential(id) {
    const cred = this.biometricCredentials.get(id);
    if (cred) {
      cred.status = CREDENTIAL_STATUS.REVOKED;
      return true;
    }
    return false;
  }

  // --- Vault Credential Repository Methods ---
  async createVaultCredential({ user_id, pin_hash }) {
    const cred = {
      user_id,
      pin_hash,
      updated_at: new Date().toISOString()
    };
    this.vaultCredentials.set(user_id, cred);
    return cred;
  }

  async findVaultCredentialByUserId(user_id) {
    return this.vaultCredentials.get(user_id) || null;
  }

  async updatePinHash(user_id, pin_hash) {
    const cred = this.vaultCredentials.get(user_id);
    if (!cred) throw new Error('Vault credential not found');
    cred.pin_hash = pin_hash;
    cred.updated_at = new Date().toISOString();
    return cred;
  }

  // --- Authentication Attempt Repository Methods ---
  async createAuthAttempt({ user_id, biometric_result, pin_result, final_result, failure_reason = null }) {
    const id = CryptoService.generateId();
    const attempt = {
      id,
      user_id,
      biometric_result,
      pin_result,
      final_result,
      failure_reason,
      created_at: new Date().toISOString()
    };
    this.authenticationAttempts.unshift(attempt);
    if (this.authenticationAttempts.length > 200) {
      this.authenticationAttempts.pop();
    }
    return attempt;
  }

  async listAuthAttempts({ limit = 50, offset = 0 } = {}) {
    return this.authenticationAttempts.slice(offset, offset + limit);
  }

  async countRecentFailedPinAttempts(user_id, windowSeconds = 300) {
    const cutoff = Date.now() - (windowSeconds * 1000);
    return this.authenticationAttempts.filter(att => 
      att.user_id === user_id &&
      att.pin_result === PIN_RESULTS.FAILURE &&
      new Date(att.created_at).getTime() >= cutoff
    ).length;
  }

  // --- Vault Event Repository Methods ---
  async createVaultEvent({ user_id, event_type }) {
    const id = CryptoService.generateId();
    const event = {
      id,
      user_id,
      event_type,
      created_at: new Date().toISOString()
    };
    this.vaultEvents.unshift(event);
    if (this.vaultEvents.length > 200) {
      this.vaultEvents.pop();
    }
    return event;
  }

  async listVaultEvents({ limit = 50, offset = 0 } = {}) {
    return this.vaultEvents.slice(offset, offset + limit);
  }

  // --- Device Repository Methods ---
  async upsertDevice({ id, user_id, device_name, connection_status }) {
    const deviceId = id || CryptoService.generateId();
    const now = new Date().toISOString();
    const device = {
      id: deviceId,
      user_id,
      device_name: device_name || 'ARDUINO-UNO-01',
      connection_status: connection_status || DEVICE_STATUS.DISCONNECTED,
      last_seen_at: now,
      created_at: now
    };
    this.devices.set(deviceId, device);
    return device;
  }

  async listDevices() {
    return Array.from(this.devices.values());
  }

  // --- Biometric Recording Repository Methods ---
  async createBiometricRecording({ id, user_id, pulse_samples, raw_samples, red_samples, ir_samples, sample_rate, sample_count, device_info = 'Heart Sensor (Pulse Sensor)', recorded_at }) {
    const recordingId = id || CryptoService.generateId();
    const primary = pulse_samples || raw_samples || red_samples || [];
    const recording = {
      id: recordingId,
      user_id,
      pulse_samples: [...primary],
      raw_samples: [...primary],
      red_samples: red_samples ? [...red_samples] : [...primary],
      ir_samples: ir_samples ? [...ir_samples] : [...primary],
      sample_rate: Number(sample_rate),
      sample_count: Number(sample_count),
      device_info: device_info || 'Heart Sensor (Pulse Sensor)',
      recorded_at: recorded_at || new Date().toISOString()
    };
    this.biometricRecordings.set(recordingId, recording);
    return recording;
  }

  async listBiometricRecordingsByUserId(user_id, { limit = 50, offset = 0 } = {}) {
    const list = [];
    for (const rec of this.biometricRecordings.values()) {
      if (rec.user_id === user_id) {
        list.push(rec);
      }
    }
    // Sort descending by recorded_at
    list.sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());
    return list.slice(offset, offset + limit);
  }

  async findBiometricRecordingById(id) {
    return this.biometricRecordings.get(id) || null;
  }

  async countBiometricRecordingsByUserId(user_id) {
    let count = 0;
    for (const rec of this.biometricRecordings.values()) {
      if (rec.user_id === user_id) count++;
    }
    return count;
  }
}

export const repository = new InMemoryRepositoryManager();
