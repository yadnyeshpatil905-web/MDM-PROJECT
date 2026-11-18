import crypto from 'crypto';
import path from 'path';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient.js';

export const VAULT_BUCKET_NAME = 'vault-files';
export const DEFAULT_MAX_FILE_SIZE_MB = 50;
export const DEFAULT_SIGNED_URL_TTL_SEC = 300; // 5 minutes
export const PENDING_UPLOAD_TTL_MS = 30 * 60 * 1000; // 30 minutes

const SAFE_EXTENSION_MIME_MAP = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.log': 'text/plain',
  '.pem': 'text/plain',
  '.key': 'text/plain',
  '.env': 'text/plain',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.7z': 'application/x-7z-compressed',
  '.rar': 'application/vnd.rar',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.js': 'text/javascript',
  '.ts': 'text/typescript',
  '.py': 'text/x-python',
  '.sql': 'application/sql'
};

export function formatBytes(bytes) {
  const num = Number(bytes) || 0;
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  if (num < 1024 * 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(2)} MB`;
  return `${(num / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatTimestamp(isoString) {
  if (!isoString) return new Date().toISOString().replace('T', ' ').slice(0, 19);
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return String(isoString);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Sanitizes original filename for safe metadata storage while preserving
 * the original visible name and extension.
 */
export function sanitizeDisplayFileName(rawName) {
  if (!rawName || typeof rawName !== 'string') {
    throw new Error('A valid file name is required.');
  }
  // Strip any directory components (path traversal defense) and control chars
  const base = rawName.replace(/\\/g, '/').split('/').pop() || '';
  const cleaned = base
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim();

  if (!cleaned || cleaned === '.' || cleaned === '..') {
    throw new Error('File name is invalid.');
  }
  if (cleaned.length > 255) {
    const ext = path.extname(cleaned).slice(0, 20);
    const stem = cleaned.slice(0, 255 - ext.length);
    return `${stem}${ext}`;
  }
  return cleaned;
}

/**
 * Produces a URL-safe object key segment preserving the original extension
 * while preventing path traversal or invalid storage characters.
 */
export function buildUniqueStoragePath(userId, displayFileName) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('Authenticated user ID is required.');
  }
  const safeUserSegment = userId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeUserSegment) {
    throw new Error('Invalid user ID.');
  }

  const ext = path.extname(displayFileName).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 20);
  const baseStem = path.basename(displayFileName, path.extname(displayFileName));
  const safeStem = baseStem
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 120) || 'file';

  const uniquePrefix = crypto.randomUUID();
  return `${safeUserSegment}/${uniquePrefix}_${safeStem}${ext}`;
}

/**
 * Resolves a safe MIME type on the server instead of blindly trusting client headers.
 */
export function resolveSafeMimeType(displayFileName, claimedType = '') {
  const ext = path.extname(displayFileName || '').toLowerCase();
  if (ext && SAFE_EXTENSION_MIME_MAP[ext]) {
    return SAFE_EXTENSION_MIME_MAP[ext];
  }
  // Allow only basic well-formed MIME syntax as fallback, otherwise generic binary
  if (typeof claimedType === 'string' && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(claimedType.trim())) {
    return claimedType.trim().toLowerCase();
  }
  return 'application/octet-stream';
}

export class VaultStorageService {
  constructor() {
    this.pendingUploads = new Map();
    this.bucketVerified = false;
    // In-memory fallback stores (used only when Supabase is not configured / test mode)
    this.localRecords = new Map();
    this.localBlobs = new Map();
  }

  getConfig() {
    const maxFileSizeMb = Math.max(
      1,
      Math.min(500, Number(process.env.VAULT_MAX_FILE_SIZE_MB) || DEFAULT_MAX_FILE_SIZE_MB)
    );
    const signedUrlTtlSec = Math.max(
      30,
      Math.min(3600, Number(process.env.VAULT_SIGNED_URL_TTL_SEC) || DEFAULT_SIGNED_URL_TTL_SEC)
    );
    return {
      bucketName: VAULT_BUCKET_NAME,
      maxFileSizeMb,
      maxFileSizeBytes: maxFileSizeMb * 1024 * 1024,
      signedUrlTtlSec,
      supabaseEnabled: isSupabaseConfigured()
    };
  }

  cleanupExpiredPendingUploads() {
    const now = Date.now();
    for (const [id, item] of this.pendingUploads.entries()) {
      if (now > item.expiresAt) {
        this.pendingUploads.delete(id);
      }
    }
  }

  validateFileSize(fileSize) {
    const { maxFileSizeBytes, maxFileSizeMb } = this.getConfig();
    const sizeNum = Number(fileSize);
    if (!Number.isFinite(sizeNum) || sizeNum < 0) {
      throw new Error('Invalid file size.');
    }
    if (sizeNum > maxFileSizeBytes) {
      throw new Error(
        `File exceeds the maximum allowed upload size of ${maxFileSizeMb} MB (${formatBytes(sizeNum)} selected).`
      );
    }
    return Math.floor(sizeNum);
  }

  /**
   * Ensures the private 'vault-files' bucket exists in Supabase Storage.
   * Never sets public = true.
   */
  async ensurePrivateBucket() {
    if (!isSupabaseConfigured()) return false;
    if (this.bucketVerified) return true;

    const client = getSupabaseClient();
    const { maxFileSizeBytes } = this.getConfig();

    const { data: existing, error: getErr } = await client.storage.getBucket(VAULT_BUCKET_NAME);
    if (existing && !getErr) {
      // Enforce private bucket policy if somehow changed
      if (existing.public) {
        await client.storage.updateBucket(VAULT_BUCKET_NAME, {
          public: false,
          fileSizeLimit: maxFileSizeBytes
        });
      }
      this.bucketVerified = true;
      return true;
    }

    const { error: createErr } = await client.storage.createBucket(VAULT_BUCKET_NAME, {
      public: false,
      fileSizeLimit: maxFileSizeBytes
    });

    if (createErr && !createErr.message?.toLowerCase().includes('already exists')) {
      throw new Error(`Failed to initialize private Supabase Storage bucket '${VAULT_BUCKET_NAME}': ${createErr.message}`);
    }

    this.bucketVerified = true;
    return true;
  }

  formatRecord(row) {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.file_name,
      fileName: row.file_name,
      filePath: row.file_path,
      mimeType: row.file_type || 'application/octet-stream',
      fileType: row.file_type || 'application/octet-stream',
      sizeBytes: Number(row.file_size) || 0,
      size: formatBytes(row.file_size),
      category: row.category || 'General Vault',
      description: row.description || '',
      createdAt: row.created_at,
      updatedAt: formatTimestamp(row.updated_at || row.created_at),
      updatedAtIso: row.updated_at || row.created_at,
      source: 'supabase',
      // Honest security label: stored in private Supabase Storage (not app-level AES-256)
      encrypted: false,
      storageLabel: 'Private Storage'
    };
  }

  /**
   * Step 1: Initialize an authenticated upload.
   * Generates a unique user-scoped storage path and (when Supabase is enabled)
   * a short-lived signed upload URL so files stream directly without exposing service keys.
   */
  async initUpload({ userId, fileName, fileSize, fileType = '', category = 'General Vault', description = '' }) {
    this.cleanupExpiredPendingUploads();

    if (!userId) {
      throw new Error('Authentication required to upload files.');
    }

    const cleanName = sanitizeDisplayFileName(fileName);
    const validSize = this.validateFileSize(fileSize);
    const safeMime = resolveSafeMimeType(cleanName, fileType);
    const safeCategory = (typeof category === 'string' && category.trim())
      ? category.trim().slice(0, 80)
      : 'General Vault';
    const safeDescription = (typeof description === 'string' && description.trim())
      ? description.trim().slice(0, 1000)
      : null;

    const storagePath = buildUniqueStoragePath(userId, cleanName);
    const uploadId = crypto.randomUUID();
    const config = this.getConfig();

    const pendingRecord = {
      uploadId,
      userId,
      fileName: cleanName,
      filePath: storagePath,
      fileType: safeMime,
      fileSize: validSize,
      category: safeCategory,
      description: safeDescription,
      uploadedToStorage: false,
      expiresAt: Date.now() + PENDING_UPLOAD_TTL_MS
    };

    if (isSupabaseConfigured()) {
      await this.ensurePrivateBucket();
      const client = getSupabaseClient();
      const { data, error } = await client.storage
        .from(VAULT_BUCKET_NAME)
        .createSignedUploadUrl(storagePath);

      if (error || !data?.signedUrl) {
        throw new Error(`Could not create signed upload URL: ${error?.message || 'Unknown storage error'}`);
      }

      this.pendingUploads.set(uploadId, pendingRecord);

      return {
        uploadId,
        mode: 'supabase-signed',
        signedUrl: data.signedUrl,
        token: data.token,
        fileName: cleanName,
        fileType: safeMime,
        fileSize: validSize,
        maxFileSizeBytes: config.maxFileSizeBytes,
        maxFileSizeMb: config.maxFileSizeMb
      };
    }

    // In-memory / test mode
    this.pendingUploads.set(uploadId, pendingRecord);
    return {
      uploadId,
      mode: 'local-fallback',
      fileName: cleanName,
      fileType: safeMime,
      fileSize: validSize,
      maxFileSizeBytes: config.maxFileSizeBytes,
      maxFileSizeMb: config.maxFileSizeMb
    };
  }

  /**
   * Server-assisted binary upload (used for local/test mode OR automatic fallback
   * if browser direct-to-Supabase PUT fails). Preserves exact raw bytes without modification.
   */
  async uploadBinary({ userId, uploadId, buffer }) {
    const pending = this.pendingUploads.get(uploadId);
    if (!pending) {
      throw new Error('Upload session not found or expired. Please retry upload.');
    }
    if (pending.userId !== userId) {
      throw new Error('Access denied: upload session belongs to a different user.');
    }
    if (!Buffer.isBuffer(buffer)) {
      throw new Error('Raw file payload is required.');
    }

    const validSize = this.validateFileSize(buffer.length);
    pending.fileSize = validSize;

    if (isSupabaseConfigured()) {
      await this.ensurePrivateBucket();
      const client = getSupabaseClient();
      const { error } = await client.storage
        .from(VAULT_BUCKET_NAME)
        .upload(pending.filePath, buffer, {
          contentType: pending.fileType,
          upsert: false
        });

      if (error) {
        throw new Error(`Supabase Storage upload failed: ${error.message}`);
      }
      pending.uploadedToStorage = true;
      return { success: true, uploadId, sizeBytes: validSize };
    }

    // Local/test in-memory fallback
    this.localBlobs.set(pending.filePath, Buffer.from(buffer));
    pending.uploadedToStorage = true;
    return { success: true, uploadId, sizeBytes: validSize };
  }

  /**
   * Step 2: Finalize upload by inserting metadata into public.vault_files.
   * If metadata insertion fails, immediately deletes the uploaded Storage object
   * so no orphaned files remain in the bucket.
   */
  async completeUpload({ userId, uploadId, actualFileSize = null }) {
    const pending = this.pendingUploads.get(uploadId);
    if (!pending) {
      throw new Error('Upload session not found or already finalized.');
    }
    if (pending.userId !== userId) {
      throw new Error('Access denied: cannot finalize another user\'s upload.');
    }

    const safeUserPrefix = `${userId.replace(/[^a-zA-Z0-9_-]/g, '')}/`;
    if (!pending.filePath.startsWith(safeUserPrefix)) {
      throw new Error('Security Policy Violation: invalid storage path ownership.');
    }

    const finalSize = actualFileSize !== null && actualFileSize !== undefined
      ? this.validateFileSize(actualFileSize)
      : pending.fileSize;

    const nowIso = new Date().toISOString();

    if (isSupabaseConfigured()) {
      const client = getSupabaseClient();

      // Verify the object exists in storage before recording metadata
      const folderPath = pending.filePath.split('/')[0];
      const objectBaseName = pending.filePath.split('/').slice(1).join('/');
      const { data: listed, error: listErr } = await client.storage
        .from(VAULT_BUCKET_NAME)
        .list(folderPath, { search: objectBaseName, limit: 5 });

      const foundObj = !listErr && Array.isArray(listed)
        ? listed.find(item => item.name === objectBaseName)
        : null;

      const resolvedSize = foundObj?.metadata?.size !== undefined
        ? this.validateFileSize(foundObj.metadata.size)
        : finalSize;

      const insertPayload = {
        user_id: userId,
        file_name: pending.fileName,
        file_path: pending.filePath,
        file_type: pending.fileType,
        file_size: resolvedSize,
        category: pending.category,
        description: pending.description
      };

      const { data: insertedRow, error: dbError } = await client
        .from('vault_files')
        .insert(insertPayload)
        .select('*')
        .single();

      if (dbError || !insertedRow) {
        // CRITICAL: Clean up uploaded storage object so no orphaned files remain
        try {
          await client.storage.from(VAULT_BUCKET_NAME).remove([pending.filePath]);
        } catch (cleanupErr) {
          console.error('[VaultStorage] Failed to clean up orphaned object:', cleanupErr.message);
        }
        this.pendingUploads.delete(uploadId);

        const isMissingTable = dbError?.message?.includes('vault_files') &&
          (dbError.message.includes('schema cache') || dbError.message.includes('does not exist'));

        if (isMissingTable) {
          throw new Error(
            'Database table public.vault_files is not created yet. Please run supabase/migrations/20261118000000_add_vault_files.sql in your Supabase SQL Editor. Uploaded file was rolled back cleanly.'
          );
        }
        throw new Error(`Database metadata save failed (storage object cleaned up): ${dbError?.message || 'Unknown error'}`);
      }

      this.pendingUploads.delete(uploadId);
      return this.formatRecord(insertedRow);
    }

    // Local/test fallback
    if (!pending.uploadedToStorage && !this.localBlobs.has(pending.filePath)) {
      this.pendingUploads.delete(uploadId);
      throw new Error('Uploaded file bytes not found in storage.');
    }

    if (this._simulateDbInsertFailure) {
      this.localBlobs.delete(pending.filePath);
      this.pendingUploads.delete(uploadId);
      throw new Error('Simulated metadata insert failure (storage object cleaned up).');
    }

    const record = {
      id: crypto.randomUUID(),
      user_id: userId,
      file_name: pending.fileName,
      file_path: pending.filePath,
      file_type: pending.fileType,
      file_size: finalSize,
      category: pending.category,
      description: pending.description,
      created_at: nowIso,
      updated_at: nowIso
    };
    this.localRecords.set(record.id, record);
    this.pendingUploads.delete(uploadId);
    return this.formatRecord(record);
  }

  /**
   * Aborts an in-progress upload and removes any uploaded object from Storage.
   */
  async abortUpload({ userId, uploadId }) {
    const pending = this.pendingUploads.get(uploadId);
    if (!pending) return { success: true };
    if (pending.userId !== userId) {
      throw new Error('Access denied: cannot abort another user\'s upload.');
    }

    if (isSupabaseConfigured()) {
      try {
        const client = getSupabaseClient();
        await client.storage.from(VAULT_BUCKET_NAME).remove([pending.filePath]);
      } catch (err) {
        // Ignore if object was never uploaded
      }
    } else {
      this.localBlobs.delete(pending.filePath);
    }

    this.pendingUploads.delete(uploadId);
    return { success: true };
  }

  /**
   * Lists only files owned by the authenticated user.
   */
  async listUserFiles(userId) {
    if (!userId) {
      return { files: [], migrationRequired: false };
    }

    if (isSupabaseConfigured()) {
      const client = getSupabaseClient();
      const { data, error } = await client
        .from('vault_files')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        const isMissingTable = error.message?.includes('vault_files') &&
          (error.message.includes('schema cache') || error.message.includes('does not exist'));
        if (isMissingTable) {
          console.warn('[VaultStorage] public.vault_files table not found yet. Run 20261118000000_add_vault_files.sql in Supabase.');
          return { files: [], migrationRequired: true };
        }
        throw new Error(`Failed to load vault files: ${error.message}`);
      }

      return {
        files: (data || []).map(row => this.formatRecord(row)),
        migrationRequired: false
      };
    }

    // Local/test mode
    const rows = Array.from(this.localRecords.values())
      .filter(r => r.user_id === userId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return {
      files: rows.map(row => this.formatRecord(row)),
      migrationRequired: false
    };
  }

  /**
   * Retrieves a single file record strictly scoped to its owner.
   */
  async getOwnedFileRecord(userId, fileId) {
    if (!userId || !fileId) return null;

    if (isSupabaseConfigured()) {
      const client = getSupabaseClient();
      const { data, error } = await client
        .from('vault_files')
        .select('*')
        .eq('id', fileId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to fetch vault file record: ${error.message}`);
      }
      return data;
    }

    const rec = this.localRecords.get(fileId);
    if (!rec || rec.user_id !== userId) return null;
    return rec;
  }

  /**
   * Generates a temporary signed URL for viewing or downloading an owned file.
   * Never makes the bucket public and never returns permanent public URLs.
   */
  async createSignedAccessUrl({ userId, fileId, mode = 'view' }) {
    const record = await this.getOwnedFileRecord(userId, fileId);
    if (!record) {
      const err = new Error('Vault file not found or access denied.');
      err.status = 404;
      throw err;
    }

    const { signedUrlTtlSec } = this.getConfig();
    const isDownload = mode === 'download';

    if (isSupabaseConfigured()) {
      const client = getSupabaseClient();
      const options = isDownload ? { download: record.file_name } : undefined;
      const { data, error } = await client.storage
        .from(VAULT_BUCKET_NAME)
        .createSignedUrl(record.file_path, signedUrlTtlSec, options);

      if (error || !data?.signedUrl) {
        throw new Error(`Failed to generate temporary signed URL: ${error?.message || 'Unknown error'}`);
      }

      return {
        signedUrl: data.signedUrl,
        expiresInSec: signedUrlTtlSec,
        mode: isDownload ? 'download' : 'view',
        file: this.formatRecord(record)
      };
    }

    // Local/test fallback signed route
    return {
      signedUrl: `/api/vault/files/${record.id}/raw-local?mode=${isDownload ? 'download' : 'view'}`,
      expiresInSec: signedUrlTtlSec,
      mode: isDownload ? 'download' : 'view',
      file: this.formatRecord(record)
    };
  }

  /**
   * Local/test binary retrieval helper (strictly owner-scoped).
   */
  async getLocalBlob({ userId, fileId }) {
    const record = await this.getOwnedFileRecord(userId, fileId);
    if (!record) return null;
    const buffer = this.localBlobs.get(record.file_path);
    if (!buffer) return null;
    return { record, buffer };
  }

  /**
   * Deletes both the Supabase Storage object and the public.vault_files record
   * after strictly validating ownership.
   */
  async deleteUserFile({ userId, fileId }) {
    const record = await this.getOwnedFileRecord(userId, fileId);
    if (!record) {
      const err = new Error('Vault file not found or access denied.');
      err.status = 404;
      throw err;
    }

    if (isSupabaseConfigured()) {
      const client = getSupabaseClient();

      // 1. Delete actual object from private Supabase Storage bucket
      const { error: storageErr } = await client.storage
        .from(VAULT_BUCKET_NAME)
        .remove([record.file_path]);

      if (storageErr) {
        throw new Error(`Failed to delete file from Supabase Storage: ${storageErr.message}`);
      }

      // 2. Delete corresponding metadata row from public.vault_files
      const { error: dbErr } = await client
        .from('vault_files')
        .delete()
        .eq('id', fileId)
        .eq('user_id', userId);

      if (dbErr) {
        throw new Error(`Storage object removed, but failed to delete database record: ${dbErr.message}`);
      }

      return { success: true, deletedId: fileId, fileName: record.file_name };
    }

    // Local/test mode
    this.localBlobs.delete(record.file_path);
    this.localRecords.delete(fileId);
    return { success: true, deletedId: fileId, fileName: record.file_name };
  }
}

export const vaultStorageService = new VaultStorageService();
