process.env.NODE_ENV = 'test';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../server/index.js';
import { authService } from '../server/services/authService.js';

let server;
let port;
let baseUrl;

function generateSamplePayload(count = 100, rate = 100) {
  const pulse_samples = [];
  for (let i = 0; i < count; i++) {
    const pulse = Math.sin(i * 0.2) * 150;
    pulse_samples.push(Math.max(10, Math.min(1020, Math.round(512 + pulse))));
  }
  return {
    pulse_samples,
    raw_samples: [...pulse_samples],
    red_samples: [...pulse_samples],
    ir_samples: [...pulse_samples],
    sample_rate: rate,
    sample_count: count,
    device_info: 'HW-827 Pulse Sensor Test Device'
  };
}

test('API Integration Tests for HW-827 Pulse Sensor Raw Waveform & Security', async (t) => {
  // Start server on ephemeral port for integration testing
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  t.after(() => {
    server.close();
  });

  const demoUserId = 'a0000000-0000-0000-0000-000000000001';
  const session = authService.createSession(demoUserId, 'alex.morgan@biolock.internal', 3600);
  const validToken = session.token;

  await t.test('POST /api/biometrics/recordings/enroll rejects request without Authorization header', async () => {
    const res = await fetch(`${baseUrl}/api/biometrics/recordings/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawRecording: generateSamplePayload() })
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.error, /Authorization header missing/i);
  });

  await t.test('POST /api/biometrics/recordings/enroll rejects invalid or forged Bearer token', async () => {
    const res = await fetch(`${baseUrl}/api/biometrics/recordings/enroll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer forged-invalid-token-12345'
      },
      body: JSON.stringify({ rawRecording: generateSamplePayload() })
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.error, /Invalid or expired authorization token/i);
  });

  await t.test('POST /api/biometrics/recordings/enroll rejects spoofed userId mismatch in request body (Requirement 5)', async () => {
    const res = await fetch(`${baseUrl}/api/biometrics/recordings/enroll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${validToken}`
      },
      body: JSON.stringify({
        userId: 'spoofed-attacker-user-id',
        rawRecording: generateSamplePayload()
      })
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.error, /Supplied userId does not match authenticated identity/i);
  });

  await t.test('POST /api/biometrics/recordings/enroll succeeds with authenticated token and valid waveform', async () => {
    const res = await fetch(`${baseUrl}/api/biometrics/recordings/enroll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${validToken}`
      },
      body: JSON.stringify({
        rawRecording: generateSamplePayload(100, 100)
      })
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.recordingId);
    assert.equal(body.userId, demoUserId);
    assert.equal(body.stats.sampleCount, 100);
    assert.equal(body.stats.sampleRate, 100);
  });

  await t.test('GET /api/biometrics/recordings returns private metadata list without exposing raw arrays (Requirement 6)', async () => {
    const res = await fetch(`${baseUrl}/api/biometrics/recordings`, {
      headers: {
        'Authorization': `Bearer ${validToken}`
      }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.recordings.length >= 1);
    const rec = body.recordings[0];
    assert.equal(rec.userId, demoUserId);
    assert.equal(rec.hasRedData, true);
    assert.equal(rec.hasIrData, true);
    // Strict privacy validation
    assert.equal(rec.red_samples, undefined);
    assert.equal(rec.ir_samples, undefined);
  });

  await t.test('POST /api/biometrics/recordings/evaluate enforces Requirement 7 notice', async () => {
    const res = await fetch(`${baseUrl}/api/biometrics/recordings/evaluate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${validToken}`
      },
      body: JSON.stringify({
        recordingA: generateSamplePayload(),
        recordingB: generateSamplePayload()
      })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.correlation !== undefined);
    assert.match(body.scientificNotice, /Identification accuracy between multiple individuals requires cross-session evaluation/i);
  });

  await t.test('GET /api/biometrics/limitations returns physiological notices', async () => {
    const res = await fetch(`${baseUrl}/api/biometrics/limitations`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.limitations.length > 0);
  });

  await t.test('POST /api/auth/register supports raw HW-827 Pulse Sensor enrollment alongside template', async () => {
    const newEmail = `operator_${Date.now()}@internal.org`;
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Jordan Lee',
        email: newEmail,
        password: 'ValidPassword123!',
        pin: '5678',
        pinConfirm: '5678',
        templateData: [
          40, 80, 140, 210, 250, 235, 190, 145, 115, 90,
          80, 100, 120, 105, 80, 60, 45, 35, 28, 20
        ],
        rawRecording: generateSamplePayload(100, 100)
      })
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.userId);
    assert.ok(body.sessionToken);
    assert.equal(body.rawRecordingEnrolled, true);
    assert.ok(body.rawRecordingId);
  });

  await t.test('Two-Step Auth flow preserved: biometric verify -> PIN verify -> actuator unlock', async () => {
    // Step 1: Biometric verify
    const bioRes = await fetch(`${baseUrl}/api/auth/biometric-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: demoUserId,
        sampleTemplate: [
          35, 78, 142, 215, 255, 240, 195, 150, 120, 95,
          82, 105, 125, 110, 85, 65, 48, 38, 30, 25
        ]
      })
    });
    assert.equal(bioRes.status, 200);
    const bioData = await bioRes.json();
    assert.equal(bioData.success, true);
    assert.ok(bioData.challengeId);

    // Step 2: PIN verify
    const pinRes = await fetch(`${baseUrl}/api/auth/pin-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: bioData.challengeId,
        pin: '1234'
      })
    });
    assert.equal(pinRes.status, 200);
    const pinData = await pinRes.json();
    assert.equal(pinData.success, true);
    assert.equal(pinData.vaultStatus, 'UNLOCKED');
    assert.equal(pinData.servoAngle, 90);
    assert.ok(pinData.sessionToken);
  });
});
