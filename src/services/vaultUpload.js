import { api, API_BASE, sessionAuth } from './api';

export const VAULT_CATEGORIES = [
  'General Vault',
  'Confidential Credentials',
  'Cryptographic Keys',
  'Financial Documents',
  'Sensory Data',
  'Disaster Recovery',
  'Documents',
  'Images & Media',
  'Archives'
];

export function formatFileSize(bytes) {
  const num = Number(bytes) || 0;
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  if (num < 1024 * 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(2)} MB`;
  return `${(num / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function getFileExtension(fileName = '') {
  const idx = fileName.lastIndexOf('.');
  if (idx <= 0) return '';
  return fileName.slice(idx).toLowerCase();
}

/**
 * Classifies how a file can be safely previewed in the browser.
 * Note: .html, .htm, and .svg are treated as plain 'text' rather than active
 * rendered content to prevent XSS from untrusted uploads.
 */
export function getPreviewKind(fileName = '', mimeType = '') {
  const ext = getFileExtension(fileName);
  const mime = (mimeType || '').toLowerCase();

  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(ext) ||
      ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp'].includes(mime)) {
    return 'image';
  }

  if (ext === '.pdf' || mime === 'application/pdf') {
    return 'pdf';
  }

  if (['.mp4', '.webm', '.ogg'].includes(ext) || ['video/mp4', 'video/webm'].includes(mime)) {
    return 'video';
  }

  if (['.mp3', '.wav'].includes(ext) || ['audio/mpeg', 'audio/wav', 'audio/ogg'].includes(mime)) {
    return 'audio';
  }

  if (
    ['.txt', '.csv', '.json', '.xml', '.md', '.log', '.pem', '.key', '.env', '.js', '.ts', '.jsx', '.tsx', '.py', '.sql', '.html', '.htm', '.svg', '.yaml', '.yml', '.ini'].includes(ext) ||
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml'
  ) {
    return 'text';
  }

  return 'unsupported';
}

export function resolveAccessUrl(signedUrl) {
  if (!signedUrl) return '';
  if (signedUrl.startsWith('http://') || signedUrl.startsWith('https://')) {
    return signedUrl;
  }
  return `${API_BASE}${signedUrl}`;
}

function xhrUpload({ url, method = 'PUT', body, headers = {}, onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    const onAbort = () => {
      try { xhr.abort(); } catch (e) {}
      reject(new Error('Upload cancelled by user.'));
    };

    if (signal) {
      if (signal.aborted) {
        return reject(new Error('Upload cancelled by user.'));
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    xhr.open(method, url, true);
    Object.entries(headers).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        xhr.setRequestHeader(k, v);
      }
    });

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0 && typeof onProgress === 'function') {
        const pct = Math.min(95, Math.round((event.loaded / event.total) * 95));
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      if (signal) signal.removeEventListener('abort', onAbort);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ status: xhr.status, responseText: xhr.responseText });
      } else {
        let msg = `Upload failed (HTTP ${xhr.status})`;
        try {
          const parsed = JSON.parse(xhr.responseText);
          msg = parsed.error || parsed.message || msg;
        } catch (e) {}
        const err = new Error(msg);
        err.status = xhr.status;
        reject(err);
      }
    };

    xhr.onerror = () => {
      if (signal) signal.removeEventListener('abort', onAbort);
      const err = new Error('Network error while uploading file.');
      err.isNetworkError = true;
      reject(err);
    };

    xhr.send(body);
  });
}

async function uploadToSignedUrlWithRetry(signedUrl, file, onProgress, signal, maxRetries = 2) {
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const formData = new FormData();
      formData.append('cacheControl', '3600');
      formData.append('', file);

      await xhrUpload({
        url: signedUrl,
        method: 'PUT',
        body: formData,
        headers: { 'x-upsert': 'false' },
        onProgress,
        signal
      });
      return;
    } catch (err) {
      lastError = err;
      if (signal?.aborted) throw err;
      // Retry only on transient network or 5xx errors
      const retryable = err.isNetworkError || (err.status && err.status >= 500);
      if (!retryable || attempt === maxRetries) {
        throw err;
      }
      await new Promise(r => setTimeout(r, 700 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function uploadToBackendBinary(uploadId, file, onProgress, signal) {
  const token = sessionAuth.getToken();
  await xhrUpload({
    url: `${API_BASE}/api/vault/files/upload/${encodeURIComponent(uploadId)}/binary`,
    method: 'PUT',
    body: file,
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    onProgress,
    signal
  });
}

/**
 * Full authenticated upload pipeline for a single File:
 * 1. Initialize upload on backend (validates size/filename & gets unique path + signed upload URL)
 * 2. Stream original unmodified file bytes with live progress (0 -> 95%)
 * 3. Finalize metadata in public.vault_files (95 -> 100%)
 * 4. Automatically aborts & cleans up storage object if any step fails
 */
export async function uploadFileToVault({ file, category, description, onProgress, signal }) {
  if (!file) {
    throw new Error('No file selected.');
  }

  onProgress?.(2, 'Initializing secure upload...');

  let initRes;
  try {
    initRes = await api.initVaultUpload({
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || 'application/octet-stream',
      category: category || 'General Vault',
      description: description || ''
    });
  } catch (err) {
    if (err.status === 404) {
      throw new Error('Upload endpoint not found (HTTP 404). Restart the backend server (npm start) to load the new upload routes.');
    }
    if (err.status === 401) {
      throw new Error('Vault session expired (HTTP 401). Please click Relock Vault and unlock again with Fingerprint + PIN.');
    }
    throw err;
  }

  const { uploadId, mode, signedUrl } = initRes;

  try {
    if (mode === 'supabase-signed' && signedUrl) {
      try {
        await uploadToSignedUrlWithRetry(
          signedUrl,
          file,
          (pct) => onProgress?.(pct, 'Uploading to private vault...'),
          signal
        );
      } catch (directErr) {
        if (signal?.aborted) throw directErr;
        // Fallback to authenticated backend binary relay if browser direct PUT hit CORS/network error
        if (directErr.isNetworkError) {
          onProgress?.(10, 'Switching to secure relay...');
          await uploadToBackendBinary(
            uploadId,
            file,
            (pct) => onProgress?.(pct, 'Uploading via secure relay...'),
            signal
          );
        } else {
          throw directErr;
        }
      }
    } else {
      await uploadToBackendBinary(
        uploadId,
        file,
        (pct) => onProgress?.(pct, 'Uploading to vault...'),
        signal
      );
    }

    onProgress?.(97, 'Saving file metadata...');

    const completeRes = await api.completeVaultUpload({
      uploadId,
      actualFileSize: file.size
    });

    onProgress?.(100, 'Uploaded');
    return completeRes.file;
  } catch (err) {
    // Clean up any partial or orphaned storage object on failure/cancellation
    try {
      await api.abortVaultUpload({ uploadId });
    } catch (e) {}
    throw err;
  }
}
