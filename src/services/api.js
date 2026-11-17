/**
 * REST API Client for Smart Credential Lock Backend
 * Communicates with backend endpoints running on http://localhost:5000 (or VITE_API_URL).
 */

const API_BASE = import.meta.env?.VITE_API_URL || 'http://localhost:5000';

let currentSessionToken = null;

export const sessionAuth = {
  setToken: (token) => {
    currentSessionToken = token;
    if (token) {
      try { sessionStorage.setItem('biolock_token', token); } catch (e) {}
    } else {
      try { sessionStorage.removeItem('biolock_token'); } catch (e) {}
    }
  },
  getToken: () => {
    if (currentSessionToken) return currentSessionToken;
    try {
      currentSessionToken = sessionStorage.getItem('biolock_token');
    } catch (e) {}
    return currentSessionToken;
  },
  clearToken: () => {
    currentSessionToken = null;
    try { sessionStorage.removeItem('biolock_token'); } catch (e) {}
  }
};

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const token = options.token || sessionAuth.getToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers
  };

  const config = {
    ...options,
    headers
  };

  try {
    const res = await fetch(url, config);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(data.error || data.failureReason || `HTTP ${res.status}: ${res.statusText}`);
      error.status = res.status;
      error.data = data;
      throw error;
    }
    return data;
  } catch (err) {
    if (!err.status) {
      console.warn(`[API] Network error communicating with ${url}:`, err.message);
    }
    throw err;
  }
}

export const api = {
  // Profiles
  getUsers: () => request('/api/users'),

  // Registration & Biometric Enrollment
  register: (payload) => request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),

  // Operator Login
  login: (payload) => request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),

  // HW-827 Pulse Sensor Raw Waveform Storage & Enrollment (public.biometric_recordings)
  enrollRawRecording: (payload, token = null) => request('/api/biometrics/recordings/enroll', {
    method: 'POST',
    body: JSON.stringify(payload),
    token
  }),

  getUserRecordings: (token = null) => request('/api/biometrics/recordings', {
    token
  }),

  evaluateRecordings: (payload, token = null) => request('/api/biometrics/recordings/evaluate', {
    method: 'POST',
    body: JSON.stringify(payload),
    token
  }),

  getBiometricLimitations: () => request('/api/biometrics/limitations'),

  // Two-Step Authentication
  verifyBiometric: (payload) => request('/api/auth/biometric-verify', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),

  verifyPin: (payload) => request('/api/auth/pin-verify', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),

  // Vault Status & Actuation
  getVaultStatus: () => request('/api/vault/status'),
  relockVault: (userId) => request('/api/vault/relock', {
    method: 'POST',
    body: JSON.stringify({ userId })
  }),

  // Vault Files & Folder Management
  getVaultFiles: () => request('/api/vault/files'),
  getVaultFileById: (id) => request(`/api/vault/files/${id}`),
  createVaultFile: (payload) => request('/api/vault/files', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  deleteVaultFile: (id) => request(`/api/vault/files/${id}`, {
    method: 'DELETE'
  }),

  // Audit Logs & Devices
  getHistory: () => request('/api/history'),
  getDevices: () => request('/api/devices'),
  getDeviceStatus: () => request('/api/device/status'),

  // Settings
  getSettings: () => request('/api/settings'),
  updateSettings: (payload) => request('/api/settings', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
};

