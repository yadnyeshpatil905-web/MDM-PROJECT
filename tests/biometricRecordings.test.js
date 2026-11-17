import test from 'node:test';
import assert from 'node:assert/strict';

import { BiometricService } from '../server/services/biometricService.js';
import { authService } from '../server/services/authService.js';
import { repository, InMemoryRepositoryManager } from '../server/repositories/index.js';
import { RAW_RECORDING_CONFIG, DEFAULT_CONFIG } from '../server/models/constants.js';

// Helper to generate synthetic Heart Sensor (Pulse Sensor) waveform samples (10-bit ADC, Pin A0)
function generateSyntheticPulseSensor(count = 100, rate = 100) {
  const pulse_samples = [];
  for (let i = 0; i < count; i++) {
    const phase = (i % 20) / 20;
    const pulse = Math.exp(-Math.pow((phase - 0.2) / 0.08, 2)) * 280;
    const notch = Math.exp(-Math.pow((phase - 0.38) / 0.09, 2)) * 75;
    pulse_samples.push(Math.round(512 + pulse + notch + (Math.sin(i * 0.1) * 20)));
  }
  return {
    pulse_samples,
    raw_samples: [...pulse_samples],
    red_samples: [...pulse_samples],
    ir_samples: [...pulse_samples],
    sample_rate: rate,
    sample_count: count,
    device_info: 'Heart Sensor (Pulse Sensor) Test'
  };
}

test('1. Heart Sensor (Pulse Sensor) Raw Waveform Validation', async (t) => {
  await t.test('accepts valid Heart Sensor (Pulse Sensor) recording', () => {
    const sample = generateSyntheticPulseSensor(100, 100);
    const result = BiometricService.validateRawRecording(sample);
    assert.equal(result.valid, true);
    assert.equal(result.stats.sampleCount, 100);
    assert.equal(result.stats.sampleRate, 100);
    assert.ok(result.stats.pulseRange > RAW_RECORDING_CONFIG.MIN_DYNAMIC_RANGE);
  });

  await t.test('rejects mismatched pulse array length', () => {
    const sample = generateSyntheticPulseSensor(100, 100);
    sample.pulse_samples.pop(); // length 99 vs 100
    const result = BiometricService.validateRawRecording(sample);
    assert.equal(result.valid, false);
    assert.match(result.error, /does not match sample_count/i);
  });

  await t.test('rejects sample count below minimum limit (50 samples)', () => {
    const sample = generateSyntheticPulseSensor(30, 100);
    const result = BiometricService.validateRawRecording(sample);
    assert.equal(result.valid, false);
    assert.match(result.error, /between 50 and 10000/i);
  });

  await t.test('rejects sample count exceeding maximum limit (10,000 samples)', () => {
    const result = BiometricService.validateRawRecording({
      pulse_samples: [],
      sample_rate: 100,
      sample_count: 15000
    });
    assert.equal(result.valid, false);
    assert.match(result.error, /between 50 and 10000/i);
  });

  await t.test('rejects out-of-range 10-bit ADC samples (> 1023 or < 0)', () => {
    const sample = generateSyntheticPulseSensor(100, 100);
    sample.pulse_samples[10] = 1200; // exceeds 10-bit ADC range
    const result = BiometricService.validateRawRecording(sample);
    assert.equal(result.valid, false);
    assert.match(result.error, /between 0 and 1023/i);
  });

  await t.test('rejects flatline or disconnected sensor signal', () => {
    const flatline = {
      pulse_samples: new Array(100).fill(512),
      sample_rate: 100,
      sample_count: 100
    };
    const result = BiometricService.validateRawRecording(flatline);
    assert.equal(result.valid, false);
    assert.match(result.error, /insufficient signal dynamic range/i);
  });
});

test('2. Public.biometric_recordings Repository Persistence', async (t) => {
  const repo = new InMemoryRepositoryManager();
  const testUserId = 'u0000000-0000-0000-0000-000000000099';
  const sample = generateSyntheticPulseSensor(100, 100);

  await t.test('saves validated pulse arrays to repository', async () => {
    const created = await repo.createBiometricRecording({
      user_id: testUserId,
      pulse_samples: sample.pulse_samples,
      raw_samples: sample.raw_samples,
      red_samples: sample.red_samples,
      ir_samples: sample.ir_samples,
      sample_rate: sample.sample_rate,
      sample_count: sample.sample_count,
      device_info: 'Heart Sensor (Pulse Sensor) Hardware'
    });

    assert.ok(created.id);
    assert.equal(created.user_id, testUserId);
    assert.equal(created.sample_count, 100);
    assert.equal(created.sample_rate, 100);
    assert.equal(created.pulse_samples.length, 100);
    assert.ok(created.recorded_at);
  });

  await t.test('lists recordings by user ID sorted descending by recorded_at', async () => {
    const list = await repo.listBiometricRecordingsByUserId(testUserId);
    assert.ok(list.length >= 1);
    assert.equal(list[0].user_id, testUserId);
  });

  await t.test('counts user recordings accurately', async () => {
    const count = await repo.countBiometricRecordingsByUserId(testUserId);
    assert.ok(count >= 1);
  });
});

test('3. Security & Authenticated Identity Verification (Requirement 5 & 6)', async (t) => {
  const testUserId = 'u0000000-0000-0000-0000-000000000001';

  await t.test('session creation and constant-time verification', () => {
    const session = authService.createSession(testUserId, 'test@biolock.internal', 3600);
    assert.ok(session.token);
    assert.equal(session.userId, testUserId);

    const verified = authService.verifySession(session.token);
    assert.ok(verified);
    assert.equal(verified.userId, testUserId);
  });

  await t.test('rejects expired session token', () => {
    const expiredSession = authService.createSession(testUserId, 'test@biolock.internal', -10);
    const verified = authService.verifySession(expiredSession.token);
    assert.equal(verified, null);
  });

  await t.test('enrollRawBiometricRecording requires valid registered user', async () => {
    const sample = generateSyntheticPulseSensor(100, 100);
    await assert.rejects(
      async () => {
        await authService.enrollRawBiometricRecording({
          userId: 'non-existent-user-id',
          rawRecording: sample
        });
      },
      /User profile not found/i
    );
  });

  await t.test('listUserRecordings returns sanitized metadata summaries without dumping raw arrays', async () => {
    const demoUserId = 'a0000000-0000-0000-0000-000000000001';
    const summaries = await authService.listUserRecordings(demoUserId);
    assert.ok(Array.isArray(summaries));
    assert.ok(summaries.length >= 1);
    const first = summaries[0];
    assert.ok(first.id);
    assert.equal(first.userId, demoUserId);
    assert.equal(first.sampleCount, 100);
    assert.equal(first.sampleRate, 100);
    assert.equal(first.hasRedData, true);
    assert.equal(first.hasIrData, true);
    // Explicit privacy check: raw arrays are not exposed in standard list summaries
    assert.equal(first.red_samples, undefined);
    assert.equal(first.ir_samples, undefined);
  });
});

test('4. Requirement 7: Enrollment First & Identification Benchmark', async (t) => {
  const recordingA = generateSyntheticPulseSensor(100, 100);
  const recordingB = generateSyntheticPulseSensor(100, 100);

  await t.test('evaluates correlation on separate recordings and issues scientific limitation notice', () => {
    const evaluation = BiometricService.evaluateRecordingPair(recordingA, recordingB);
    assert.ok(evaluation.correlation !== undefined);
    assert.equal(evaluation.evaluatedSamples, 100);
    assert.match(evaluation.scientificNotice, /Identification accuracy between multiple individuals requires cross-session evaluation/i);
  });

  await t.test('biometric limitations document physiological variability and absence of 2-person claims', () => {
    const limits = BiometricService.getBiometricLimitations();
    assert.ok(Array.isArray(limits.limitations));
    assert.ok(limits.limitations.some(l => l.includes('two-person identification must not be claimed')));
  });
});

test('5. Preservation of Existing Two-Step Auth & Actuator Flows (Requirement 8)', async (t) => {
  const demoUserId = 'a0000000-0000-0000-0000-000000000001';
  const enrolledTemplate = [
    35, 78, 142, 215, 255, 240, 195, 150, 120, 95,
    82, 105, 125, 110, 85, 65, 48, 38, 30, 25
  ];

  await t.test('Step 1 Biometric Verification succeeds with matching template', async () => {
    const bioResult = await authService.verifyBiometric({
      userId: demoUserId,
      sampleTemplate: enrolledTemplate
    });
    assert.equal(bioResult.success, true);
    assert.ok(bioResult.challengeId);
    assert.equal(bioResult.score, 100);
    assert.equal(bioResult.threshold, 70);

    // Step 2 PIN Verification unlocks vault
    const pinResult = await authService.verifyPin({
      challengeId: bioResult.challengeId,
      pin: '1234'
    });
    assert.equal(pinResult.success, true);
    assert.equal(pinResult.vaultStatus, 'UNLOCKED');
    assert.equal(pinResult.servoAngle, 90);
    assert.ok(pinResult.sessionToken);
  });

  await t.test('PIN verification with wrong PIN fails and decrements attempts', async () => {
    const bioResult = await authService.verifyBiometric({
      userId: demoUserId,
      sampleTemplate: enrolledTemplate
    });
    const pinResult = await authService.verifyPin({
      challengeId: bioResult.challengeId,
      pin: '9999'
    });
    assert.equal(pinResult.success, false);
    assert.match(pinResult.failureReason, /Incorrect Vault PIN/i);
  });
});
