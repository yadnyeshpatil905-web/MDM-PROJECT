process.env.NODE_ENV = 'test';
import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../server/index.js';
import { authService } from '../server/services/authService.js';
import {
  vaultStorageService,
  sanitizeDisplayFileName,
  buildUniqueStoragePath,
  resolveSafeMimeType
} from '../server/services/vaultStorageService.js';

let server;
let baseUrl;

test('Confidential Vault File Upload, Signed Access, Ownership & Cleanup Tests', async (t) => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

  t.after(() => {
    server.close();
  });

  const userAId = '11111111-1111-4111-8111-111111111111';
  const userBId = '22222222-2222-4222-8222-222222222222';
  const tokenA = authService.createSession(userAId, 'usera@biolock.internal', 3600).token;
  const tokenB = authService.createSession(userBId, 'userb@biolock.internal', 3600).token;

  await t.test('Unit: filename sanitization strips traversal while preserving original name & extension', () => {
    assert.equal(sanitizeDisplayFileName('../../secret/Quarterly Report (2026).pdf'), 'Quarterly Report (2026).pdf');
    assert.equal(sanitizeDisplayFileName('C:\\Users\\demo\\photo.PNG'), 'photo.PNG');
    assert.throws(() => sanitizeDisplayFileName('   '), /invalid|required/i);

    const p1 = buildUniqueStoragePath(userAId, 'report.pdf');
    const p2 = buildUniqueStoragePath(userAId, 'report.pdf');
    assert.ok(p1.startsWith(`${userAId}/`));
    assert.ok(p1.endsWith('.pdf'));
    assert.notEqual(p1, p2, 'Storage paths must be unique to avoid collisions');

    assert.equal(resolveSafeMimeType('budget.xlsx', 'text/html'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    assert.equal(resolveSafeMimeType('archive.zip', 'application/x-bad'), 'application/zip');
    assert.equal(resolveSafeMimeType('unknown.bin', 'not a mime!'), 'application/octet-stream');
  });

  await t.test('Security: unauthenticated upload init is rejected with 401', async () => {
    const res = await fetch(`${baseUrl}/api/vault/files/upload/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'test.pdf', fileSize: 100 })
    });
    assert.equal(res.status, 401);
  });

  await t.test('Validation: rejects files exceeding configured max size limit with 413', async () => {
    const oversizedBytes = 60 * 1024 * 1024; // 60 MB > default 50 MB
    const res = await fetch(`${baseUrl}/api/vault/files/upload/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        fileName: 'huge_video.mp4',
        fileSize: oversizedBytes,
        fileType: 'video/mp4'
      })
    });
    assert.equal(res.status, 413);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.error, /exceeds the maximum allowed upload size/i);
  });

  let uploadedFileId = null;
  const originalPayload = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x00, 0xff, 0xfe]);

  await t.test('Upload pipeline preserves exact raw bytes, filename, extension, and honest storage label', async () => {
    // 1. Init upload
    const initRes = await fetch(`${baseUrl}/api/vault/files/upload/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        fileName: 'Board_Deck_2026.pdf',
        fileSize: originalPayload.length,
        fileType: 'application/pdf',
        category: 'Financial Documents',
        description: 'Confidential Q4 board slides'
      })
    });
    assert.equal(initRes.status, 201);
    const initData = await initRes.json();
    assert.equal(initData.success, true);
    assert.ok(initData.uploadId);

    // 2. Upload exact binary bytes
    const binRes = await fetch(`${baseUrl}/api/vault/files/upload/${initData.uploadId}/binary`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/pdf',
        Authorization: `Bearer ${tokenA}`
      },
      body: originalPayload
    });
    assert.equal(binRes.status, 200);

    // 3. Complete metadata save
    const completeRes = await fetch(`${baseUrl}/api/vault/files/upload/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        uploadId: initData.uploadId,
        actualFileSize: originalPayload.length
      })
    });
    assert.equal(completeRes.status, 201);
    const completeData = await completeRes.json();
    assert.equal(completeData.success, true);
    assert.equal(completeData.file.name, 'Board_Deck_2026.pdf');
    assert.equal(completeData.file.category, 'Financial Documents');
    assert.equal(completeData.file.description, 'Confidential Q4 board slides');
    assert.equal(completeData.file.source, 'supabase');
    assert.equal(completeData.file.encrypted, false, 'Must not falsely claim application-level AES-256');
    uploadedFileId = completeData.file.id;
  });

  await t.test('GET /api/vault/files preserves 5 example files and scopes uploaded files strictly to owner', async () => {
    // Owner sees uploaded file + 5 existing example files
    const resA = await fetch(`${baseUrl}/api/vault/files`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal(resA.status, 200);
    const dataA = await resA.json();
    assert.ok(dataA.files.some(f => f.id === uploadedFileId));
    assert.equal(dataA.files.filter(f => f.source === 'example').length, 5);

    // Different user does NOT see User A's uploaded file
    const resB = await fetch(`${baseUrl}/api/vault/files`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    assert.equal(resB.status, 200);
    const dataB = await resB.json();
    assert.equal(dataB.files.some(f => f.id === uploadedFileId), false);
    assert.equal(dataB.files.filter(f => f.source === 'example').length, 5);
  });

  await t.test('Signed URL download returns exact unmodified original bytes and enforces ownership', async () => {
    // User B cannot get signed URL for User A's file
    const forbiddenRes = await fetch(`${baseUrl}/api/vault/files/${uploadedFileId}/signed-url?mode=download`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    assert.equal(forbiddenRes.status, 404);

    // User A gets temporary signed URL
    const signedRes = await fetch(`${baseUrl}/api/vault/files/${uploadedFileId}/signed-url?mode=download`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal(signedRes.status, 200);
    const signedData = await signedRes.json();
    assert.equal(signedData.success, true);
    assert.ok(signedData.signedUrl);
    assert.ok(signedData.expiresInSec > 0);

    // Download bytes and verify exact byte-for-byte equality
    const dlRes = await fetch(`${baseUrl}${signedData.signedUrl}`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal(dlRes.status, 200);
    assert.match(dlRes.headers.get('content-disposition') || '', /Board_Deck_2026\.pdf/);
    const downloadedBuf = Buffer.from(await dlRes.arrayBuffer());
    assert.deepEqual(downloadedBuf, originalPayload);
  });

  await t.test('Orphan cleanup: failed DB metadata insert removes uploaded Storage object', async () => {
    const blobsBefore = vaultStorageService.localBlobs.size;

    const initRes = await fetch(`${baseUrl}/api/vault/files/upload/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({ fileName: 'orphan_test.zip', fileSize: 8 })
    });
    const { uploadId } = await initRes.json();

    await fetch(`${baseUrl}/api/vault/files/upload/${uploadId}/binary`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: Buffer.from('PK\x03\x04test')
    });
    assert.equal(vaultStorageService.localBlobs.size, blobsBefore + 1);

    // Simulate database failure during metadata insert
    vaultStorageService._simulateDbInsertFailure = true;
    const failRes = await fetch(`${baseUrl}/api/vault/files/upload/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({ uploadId, actualFileSize: 8 })
    });
    vaultStorageService._simulateDbInsertFailure = false;

    assert.equal(failRes.status, 400);
    assert.equal(vaultStorageService.localBlobs.size, blobsBefore, 'Orphaned storage blob must be deleted on DB failure');
  });

  await t.test('Delete enforces ownership and removes both storage object and metadata record', async () => {
    // User B cannot delete User A's file
    const forbiddenDel = await fetch(`${baseUrl}/api/vault/files/${uploadedFileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    assert.equal(forbiddenDel.status, 404);

    // Owner deletes file
    const delRes = await fetch(`${baseUrl}/api/vault/files/${uploadedFileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal(delRes.status, 200);

    // File no longer appears in listing
    const listRes = await fetch(`${baseUrl}/api/vault/files`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const listData = await listRes.json();
    assert.equal(listData.files.some(f => f.id === uploadedFileId), false);
    assert.equal(vaultStorageService.localBlobs.size, 0);
  });
});
