// Shared System Constants and Enums
// Aligned exactly with official Supabase PostgreSQL schema: 20261026000000_init_ppg_vault.sql

export const SYSTEM_STATES = {
  NOT_CONNECTED: 'NOT_CONNECTED',
  ENROLLING: 'ENROLLING',
  BIOMETRIC_PENDING: 'BIOMETRIC_PENDING',
  BIOMETRIC_FAILED: 'BIOMETRIC_FAILED',
  PIN_REQUIRED: 'PIN_REQUIRED',
  PIN_FAILED: 'PIN_FAILED',
  AUTHORIZED: 'AUTHORIZED',
  LOCKED: 'LOCKED'
};

export const VAULT_STATES = {
  LOCKED: 'LOCKED',
  PIN_REQUIRED: 'PIN_REQUIRED',
  UNLOCKED: 'UNLOCKED',
  LOCKED_OUT: 'LOCKED_OUT'
};

// Matches authentication_attempts.biometric_result: ('pending', 'success', 'failure', 'unavailable')
export const BIOMETRIC_RESULTS = {
  PENDING: 'pending',
  SUCCESS: 'success',
  FAILURE: 'failure',
  UNAVAILABLE: 'unavailable'
};

// Matches authentication_attempts.pin_result: ('pending', 'success', 'failure', 'not_required')
export const PIN_RESULTS = {
  PENDING: 'pending',
  SUCCESS: 'success',
  FAILURE: 'failure',
  NOT_REQUIRED: 'not_required'
};

// Matches authentication_attempts.final_result: ('pending', 'success', 'failure', 'denied')
export const FINAL_RESULTS = {
  PENDING: 'pending',
  SUCCESS: 'success',
  FAILURE: 'failure',
  DENIED: 'denied'
};

// Matches vault_events.event_type: ('open_authorized', 'open_failed', 'closed', 'lockout')
export const VAULT_EVENT_TYPES = {
  OPEN_AUTHORIZED: 'open_authorized',
  OPEN_FAILED: 'open_failed',
  CLOSED: 'closed',
  LOCKOUT: 'lockout'
};

// Matches devices.connection_status: ('connected', 'disconnected', 'error')
export const DEVICE_STATUS = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  ERROR: 'error'
};

// Matches biometric_credentials.status: ('pending', 'active', 'revoked')
export const CREDENTIAL_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  REVOKED: 'revoked'
};

export const DEFAULT_CONFIG = {
  MATCH_THRESHOLD: 70,           // 70% template correlation threshold
  WAVE_POINTS: 20,                // 20-point morphological template
  PIN_MIN_LENGTH: 4,
  PIN_MAX_LENGTH: 8,
  PIN_MAX_ATTEMPTS: 3,            // Max consecutive failed PIN attempts
  PIN_LOCKOUT_DURATION_SEC: 300,  // 5 minutes lockout after max failures
  CHALLENGE_TTL_SEC: 90,          // 90 seconds challenge expiry for Step 2 PIN
  AUTO_LOCK_DURATION_SEC: 0       // 0 = Manual relock only (stays unlocked until user clicks Relock)
};

export const RAW_RECORDING_CONFIG = {
  MIN_SAMPLES: 50,                // Minimum 50 samples (~0.5 - 1 second)
  MAX_SAMPLES: 10000,             // Maximum 10,000 samples (~100s at 100Hz) to prevent DoS
  MIN_SAMPLE_RATE: 10,            // Min 10 Hz
  MAX_SAMPLE_RATE: 1000,          // Max 1000 Hz
  DEFAULT_SAMPLE_RATE: 100,       // Standard HW-827 Pulse Sensor default rate (100 Hz)
  ADC_MAX_VALUE: 1023,            // HW-827 Pulse Sensor 10-bit ADC max (2^10 - 1) on Pin A0
  ADC_MIN_VALUE: 0,
  MIN_DYNAMIC_RANGE: 15,          // Min peak-to-peak amplitude to verify active pulsation
  SENSOR_TYPE: 'HW-827 Pulse Sensor'
};

