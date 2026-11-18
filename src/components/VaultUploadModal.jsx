import React, { useState, useRef } from 'react';
import {
  Upload,
  X,
  FileText,
  FileCode,
  FileSpreadsheet,
  Image as ImageIcon,
  Film,
  Music,
  Archive,
  Key,
  File as GenericFileIcon,
  CheckCircle2,
  AlertCircle,
  Trash2,
  FolderOpen,
  Shield,
  Loader2
} from 'lucide-react';
import {
  VAULT_CATEGORIES,
  formatFileSize,
  getFileExtension,
  uploadFileToVault
} from '../services/vaultUpload';

function getQueueFileIcon(fileName = '') {
  const ext = getFileExtension(fileName);
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(ext)) {
    return { Icon: ImageIcon, color: 'text-cyan-400' };
  }
  if (['.mp4', '.webm', '.mov', '.avi', '.mkv'].includes(ext)) {
    return { Icon: Film, color: 'text-purple-400' };
  }
  if (['.mp3', '.wav', '.ogg', '.flac'].includes(ext)) {
    return { Icon: Music, color: 'text-pink-400' };
  }
  if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) {
    return { Icon: Archive, color: 'text-amber-400' };
  }
  if (['.csv', '.xls', '.xlsx'].includes(ext)) {
    return { Icon: FileSpreadsheet, color: 'text-emerald-400' };
  }
  if (['.json', '.xml', '.js', '.ts', '.jsx', '.tsx', '.py', '.sql', '.html', '.css'].includes(ext)) {
    return { Icon: FileCode, color: 'text-sky-400' };
  }
  if (['.pem', '.key', '.env', '.crt'].includes(ext)) {
    return { Icon: Key, color: 'text-amber-400' };
  }
  if (['.pdf', '.doc', '.docx', '.txt', '.md', '.ppt', '.pptx', '.rtf'].includes(ext)) {
    return { Icon: FileText, color: 'text-blue-400' };
  }
  return { Icon: GenericFileIcon, color: 'text-zinc-400' };
}

export default function VaultUploadModal({
  isOpen = false,
  maxFileSizeMb = 50,
  onClose = () => {},
  onUploadComplete = () => {}
}) {
  const [queue, setQueue] = useState([]);
  const [category, setCategory] = useState('General Vault');
  const [description, setDescription] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [summaryBanner, setSummaryBanner] = useState(null);

  const fileInputRef = useRef(null);
  const abortControllerRef = useRef(null);

  if (!isOpen) return null;

  const maxBytes = maxFileSizeMb * 1024 * 1024;

  const addFilesToQueue = (fileList) => {
    const incoming = Array.from(fileList || []);
    if (incoming.length === 0) return;

    setSummaryBanner(null);

    const newItems = incoming.map((file) => {
      const oversized = file.size > maxBytes;
      return {
        localId: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        file,
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        progress: 0,
        status: oversized ? 'error' : 'queued',
        statusText: oversized
          ? `File exceeds ${maxFileSizeMb} MB limit (${formatFileSize(file.size)})`
          : 'Ready to upload',
        error: oversized ? `Exceeds maximum allowed size of ${maxFileSizeMb} MB.` : null
      };
    });

    setQueue((prev) => [...prev, ...newItems]);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isUploading) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (isUploading) return;
    if (e.dataTransfer?.files?.length) {
      addFilesToQueue(e.dataTransfer.files);
    }
  };

  const handleBrowseChange = (e) => {
    if (e.target.files?.length) {
      addFilesToQueue(e.target.files);
    }
    // Reset so selecting the same file again triggers onChange
    e.target.value = '';
  };

  const handleRemoveItem = (localId) => {
    if (isUploading) return;
    setQueue((prev) => prev.filter((item) => item.localId !== localId));
  };

  const updateItem = (localId, patch) => {
    setQueue((prev) =>
      prev.map((item) => (item.localId === localId ? { ...item, ...patch } : item))
    );
  };

  const handleStartUpload = async () => {
    const pendingItems = queue.filter((item) => item.status === 'queued' || item.status === 'error');
    const validItems = pendingItems.filter((item) => item.size <= maxBytes);

    if (validItems.length === 0) {
      setSummaryBanner({
        type: 'error',
        text: 'Select at least one valid file within the size limit before uploading.'
      });
      return;
    }

    setIsUploading(true);
    setSummaryBanner(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const uploadedFiles = [];
    let failedCount = 0;

    for (const item of validItems) {
      if (controller.signal.aborted) break;

      updateItem(item.localId, {
        status: 'uploading',
        progress: 2,
        statusText: 'Starting upload...',
        error: null
      });

      try {
        const savedFile = await uploadFileToVault({
          file: item.file,
          category,
          description,
          signal: controller.signal,
          onProgress: (pct, text) => {
            updateItem(item.localId, {
              progress: pct,
              statusText: text || `Uploading ${pct}%`
            });
          }
        });

        uploadedFiles.push(savedFile);
        updateItem(item.localId, {
          status: 'done',
          progress: 100,
          statusText: 'Uploaded to private vault',
          error: null
        });
      } catch (err) {
        failedCount++;
        updateItem(item.localId, {
          status: 'error',
          statusText: err.message || 'Upload failed',
          error: err.message || 'Upload failed'
        });
      }
    }

    setIsUploading(false);
    abortControllerRef.current = null;

    if (uploadedFiles.length > 0) {
      onUploadComplete(uploadedFiles, failedCount);
    }

    if (failedCount === 0 && uploadedFiles.length > 0) {
      // All files succeeded: reset and close cleanly
      setQueue([]);
      setDescription('');
      setCategory('General Vault');
      setSummaryBanner(null);
      onClose();
    } else if (uploadedFiles.length > 0 && failedCount > 0) {
      setSummaryBanner({
        type: 'warning',
        text: `${uploadedFiles.length} file(s) uploaded successfully; ${failedCount} failed. Review errors below.`
      });
    } else if (failedCount > 0) {
      setSummaryBanner({
        type: 'error',
        text: `Upload failed for ${failedCount} file(s). Please check the error details below.`
      });
    }
  };

  const handleCancel = () => {
    if (isUploading && abortControllerRef.current) {
      abortControllerRef.current.abort();
      return;
    }
    setQueue([]);
    setDescription('');
    setSummaryBanner(null);
    onClose();
  };

  const uploadableCount = queue.filter((i) => i.status === 'queued' || (i.status === 'error' && i.size <= maxBytes)).length;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-700/80 bg-[#0e0e14] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-cyan-950/60 border border-cyan-800/80 flex items-center justify-center text-cyan-400">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">
                Upload Files to Confidential Vault
              </h3>
              <p className="text-[11px] font-mono text-zinc-400">
                Private Supabase Storage • Original format preserved • Max {maxFileSizeMb} MB/file
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCancel}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Summary Banner */}
          {summaryBanner && (
            <div
              className={`p-3 rounded-lg border text-xs font-mono flex items-start space-x-2 ${
                summaryBanner.type === 'error'
                  ? 'bg-rose-950/40 border-rose-800 text-rose-300'
                  : 'bg-amber-950/40 border-amber-800 text-amber-300'
              }`}
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{summaryBanner.text}</span>
            </div>
          )}

          {/* Drag-and-Drop Upload Area */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            className={`rounded-xl border-2 border-dashed p-6 text-center transition-all cursor-pointer ${
              isDragging
                ? 'border-cyan-400 bg-cyan-950/25'
                : 'border-zinc-700/90 bg-[#0a0a0d] hover:border-cyan-600/80 hover:bg-zinc-900/50'
            } ${isUploading ? 'opacity-60 pointer-events-none' : ''}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleBrowseChange}
              className="hidden"
            />

            <div className="w-11 h-11 rounded-xl bg-zinc-900 border border-zinc-700 mx-auto mb-3 flex items-center justify-center text-cyan-400">
              <Upload className="w-5 h-5" />
            </div>

            <p className="text-sm font-semibold text-white">
              Drag & drop files here, or click to browse
            </p>
            <p className="text-[11px] font-mono text-zinc-400 mt-1">
              Supports PDF, DOC/DOCX, TXT, CSV, XLS/XLSX, PPT/PPTX, JSON, XML, PNG/JPG/GIF, ZIP, MP4, and any other file type
            </p>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="mt-3.5 inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Browse Files</span>
            </button>
          </div>

          {/* Selected Files Queue with Per-File Progress */}
          {queue.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
                <span>Selected Files ({queue.length})</span>
                {!isUploading && (
                  <button
                    type="button"
                    onClick={() => setQueue([])}
                    className="text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
              </div>

              <div className="rounded-xl border border-zinc-800 bg-[#0a0a0d] divide-y divide-zinc-800/80 max-h-52 overflow-y-auto">
                {queue.map((item) => {
                  const { Icon, color } = getQueueFileIcon(item.name);
                  return (
                    <div key={item.localId} className="p-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center space-x-3 min-w-0">
                          <div className={`w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 ${color}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-white truncate">
                              {item.name}
                            </div>
                            <div className="text-[10px] font-mono text-zinc-500 flex items-center space-x-2">
                              <span>{formatFileSize(item.size)}</span>
                              <span>•</span>
                              <span
                                className={
                                  item.status === 'done'
                                    ? 'text-emerald-400'
                                    : item.status === 'error'
                                    ? 'text-rose-400'
                                    : item.status === 'uploading'
                                    ? 'text-cyan-400'
                                    : 'text-zinc-400'
                                }
                              >
                                {item.statusText}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 shrink-0">
                          {item.status === 'done' && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          )}
                          {item.status === 'uploading' && (
                            <span className="text-[11px] font-mono text-cyan-400 font-semibold">
                              {item.progress}%
                            </span>
                          )}
                          {item.status === 'error' && (
                            <AlertCircle className="w-4 h-4 text-rose-400" />
                          )}
                          {!isUploading && item.status !== 'done' && (
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.localId)}
                              className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
                              title="Remove file"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Per-file Progress Bar */}
                      {(item.status === 'uploading' || item.status === 'done') && (
                        <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-200 ${
                              item.status === 'done' ? 'bg-emerald-500' : 'bg-cyan-500'
                            }`}
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Optional Metadata Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider mb-1.5">
                Category (Optional)
              </label>
              <select
                value={category}
                disabled={isUploading}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700/90 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500 disabled:opacity-50"
              >
                {VAULT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider mb-1.5">
                Description (Optional)
              </label>
              <input
                type="text"
                disabled={isUploading}
                placeholder="Brief note about these files..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={300}
                className="w-full bg-zinc-900 border border-zinc-700/90 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Security Notice */}
          <div className="p-3 rounded-lg bg-zinc-900/70 border border-zinc-800 text-[11px] font-mono text-zinc-400 flex items-center space-x-2">
            <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Files are stored privately in <strong className="text-zinc-200">vault-files</strong> scoped to your account and accessed only via expiring signed URLs.
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-950 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
          >
            {isUploading ? 'Cancel Upload' : 'Cancel'}
          </button>

          <button
            type="button"
            onClick={handleStartUpload}
            disabled={isUploading || uploadableCount === 0}
            className="px-5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white flex items-center space-x-2 shadow-lg shadow-cyan-950/50 transition-colors disabled:opacity-40 cursor-pointer"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Uploading...</span>
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5" />
                <span>
                  {uploadableCount > 1 ? `Upload ${uploadableCount} Files` : 'Upload File'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
