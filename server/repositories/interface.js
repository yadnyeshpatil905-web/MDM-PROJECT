/**
 * Supabase-Ready Repository Interfaces
 * 
 * Each repository abstracts data access so the application can operate
 * interchangeably with an In-Memory store (current dev environment)
 * and the Supabase PostgreSQL client (future integration) without
 * modifying business logic.
 */

export class IProfileRepository {
  async createProfile({ id, full_name, email }) { throw new Error('Not implemented'); }
  async findById(id) { throw new Error('Not implemented'); }
  async findByEmail(email) { throw new Error('Not implemented'); }
  async listAll() { throw new Error('Not implemented'); }
}

export class IBiometricRepository {
  async createCredential({ id, user_id, template_data, template_version, status }) { throw new Error('Not implemented'); }
  async findByUserId(user_id) { throw new Error('Not implemented'); }
  async revokeCredential(id) { throw new Error('Not implemented'); }
}

export class IVaultCredentialRepository {
  async createCredential({ user_id, pin_hash }) { throw new Error('Not implemented'); }
  async findByUserId(user_id) { throw new Error('Not implemented'); }
  async updatePinHash(user_id, pin_hash) { throw new Error('Not implemented'); }
}

export class IAuthAttemptRepository {
  async createAttempt({ id, user_id, biometric_result, pin_result, final_result, failure_reason }) { throw new Error('Not implemented'); }
  async listAttempts({ limit = 50, offset = 0 } = {}) { throw new Error('Not implemented'); }
  async countRecentFailedPinAttempts(user_id, windowSeconds = 300) { throw new Error('Not implemented'); }
}

export class IVaultEventRepository {
  async createEvent({ id, user_id, event_type }) { throw new Error('Not implemented'); }
  async listEvents({ limit = 50, offset = 0 } = {}) { throw new Error('Not implemented'); }
}

export class IDeviceRepository {
  async upsertDevice({ id, user_id, device_name, connection_status, last_seen_at }) { throw new Error('Not implemented'); }
  async findById(id) { throw new Error('Not implemented'); }
  async listDevices() { throw new Error('Not implemented'); }
}

export class IBiometricRecordingRepository {
  async createRecording({ id, user_id, red_samples, ir_samples, sample_rate, sample_count, device_info, recorded_at }) { throw new Error('Not implemented'); }
  async listRecordingsByUserId(user_id, { limit = 50, offset = 0 } = {}) { throw new Error('Not implemented'); }
  async findRecordingById(id) { throw new Error('Not implemented'); }
  async countRecordingsByUserId(user_id) { throw new Error('Not implemented'); }
}

