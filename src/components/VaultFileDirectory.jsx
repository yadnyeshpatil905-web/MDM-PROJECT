import React, { useState, useEffect, useCallback } from 'react';
import {
  FolderLock,
  Search,
  Plus,
  RefreshCw,
  FileText,
  FileCode,
  FileSpreadsheet,
  Image as ImageIcon,
  Film,
  Music,
  Archive,
  Key,
  File as GenericFileIcon,
  Eye,
  Download,
  Trash2,
  X,
  Copy,
  Check,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { api, sessionAuth } from '../services/api';
import {
  getFileExtension,
  getPreviewKind,
  resolveAccessUrl
} from '../services/vaultUpload';
import VaultUploadModal from './VaultUploadModal';

function getVaultFileIcon(fileName = '', mimeType = '') {
  const ext = getFileExtension(fileName);
  const mime = (mimeType || '').toLowerCase();

  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(ext) || mime.startsWith('image/')) {
    return { Icon: ImageIcon, color: 'text-cyan-400' };
  }
  if (['.mp4', '.webm', '.mov', '.avi', '.mkv'].includes(ext) || mime.startsWith('video/')) {
    return { Icon: Film, color: 'text-purple-400' };
  }
  if (['.mp3', '.wav', '.ogg', '.flac'].includes(ext) || mime.startsWith('audio/')) {
    return { Icon: Music, color: 'text-pink-400' };
  }
  if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) {
    return { Icon: Archive, color: 'text-amber-400' };
  }
  if (['.csv', '.xls', '.xlsx'].includes(ext)) {
    return { Icon: FileSpreadsheet, color: 'text-emerald-400' };
  }
  if (['.json', '.xml', '.js', '.ts', '.jsx', '.tsx', '.py', '.sql', '.html', '.css', '.yaml', '.yml'].includes(ext)) {
    return { Icon: FileCode, color: 'text-sky-400' };
  }
  if (['.pem', '.key', '.env', '.crt'].includes(ext)) {
    return { Icon: Key, color: 'text-amber-400' };
  }
  if (['.pdf', '.doc', '.docx', '.txt', '.md', '.ppt', '.pptx', '.rtf'].includes(ext)) {
    return { Icon: FileText, color: 'text-zinc-300' };
  }
  return { Icon: GenericFileIcon, color: 'text-zinc-400' };
}

export default function VaultFileDirectory({
  isUnlocked = false,
  refreshTrigger = 0,
  title = 'Confidential Vault Files Directory'
}) {
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [maxFileSizeMb, setMaxFileSizeMb] = useState(50);
  const [migrationRequired, setMigrationRequired] = useState(false);

  // Modals & action states
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [previewState, setPreviewState] = useState(null);
  // previewState = { file, kind, signedUrl, textContent, loading, error }
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [exportingId, setExportingId] = useState(null);
  const [copiedPreview, setCopiedPreview] = useState(false);

  // Toast notification
  const [notification, setNotification] = useState(null);

  const showNotice = useCallback((type, message) => {
    setNotification({ type, message, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(() => setNotification(null), 5000);
    return () => clearTimeout(t);
  }, [notification]);

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.getVaultFiles();
      if (res && Array.isArray(res.files)) {
        setFiles(res.files);
      }
      if (res?.uploadConfig?.maxFileSizeMb) {
        setMaxFileSizeMb(res.uploadConfig.maxFileSizeMb);
      }
      setMigrationRequired(Boolean(res?.migrationRequired));
    } catch (err) {
      showNotice('error', `Failed to load vault files: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [showNotice]);

  useEffect(() => {
    if (isUnlocked) {
      loadFiles();
    }
  }, [isUnlocked, refreshTrigger, loadFiles]);

  // View file handler
  const handleViewFile = async (file) => {
    // Built-in example file
    if (file.source !== 'supabase') {
      setPreviewState({
        file,
        kind: 'text',
        signedUrl: null,
        textContent: file.content || '',
        loading: true,
        error: null
      });
      try {
        const res = await api.getVaultFileById(file.id);
        const full = res?.file || file;
        setPreviewState({
          file: full,
          kind: 'text',
          signedUrl: null,
          textContent: full.content || '',
          loading: false,
          error: null
        });
      } catch (err) {
        setPreviewState({
          file,
          kind: 'text',
          signedUrl: null,
          textContent: file.content || '',
          loading: false,
          error: err.message
        });
      }
      return;
    }

    // Real Supabase Storage file: fetch temporary signed URL
    const kind = getPreviewKind(file.name, file.mimeType);
    setPreviewState({
      file,
      kind,
      signedUrl: null,
      textContent: null,
      loading: true,
      error: null
    });

    try {
      const res = await api.getVaultFileSignedUrl(file.id, 'view');
      const resolvedUrl = resolveAccessUrl(res.signedUrl);
      const isLocalRoute = res.signedUrl?.startsWith('/api/');

      if (kind === 'text') {
        // Avoid pulling huge text files directly into DOM
        if ((file.sizeBytes || 0) > 2 * 1024 * 1024) {
          setPreviewState({
            file,
            kind: 'unsupported',
            signedUrl: resolvedUrl,
            textContent: null,
            loading: false,
            error: null
          });
          return;
        }
        const token = sessionAuth.getToken();
        const textRes = await fetch(resolvedUrl, {
          headers: isLocalRoute && token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (!textRes.ok) {
          throw new Error(`Could not retrieve file content (HTTP ${textRes.status})`);
        }
        const textContent = await textRes.text();
        setPreviewState({
          file,
          kind: 'text',
          signedUrl: resolvedUrl,
          textContent,
          loading: false,
          error: null
        });
      } else if (isLocalRoute && ['image', 'pdf', 'video', 'audio'].includes(kind)) {
        // Local fallback requires Bearer header -> convert to short-lived object URL for preview
        const token = sessionAuth.getToken();
        const blobRes = await fetch(resolvedUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (!blobRes.ok) throw new Error(`Preview failed (HTTP ${blobRes.status})`);
        const blob = await blobRes.blob();
        const objUrl = URL.createObjectURL(blob);
        setPreviewState({
          file,
          kind,
          signedUrl: objUrl,
          isObjectUrl: true,
          textContent: null,
          loading: false,
          error: null
        });
      } else {
        setPreviewState({
          file,
          kind,
          signedUrl: resolvedUrl,
          textContent: null,
          loading: false,
          error: null
        });
      }
    } catch (err) {
      setPreviewState({
        file,
        kind: 'unsupported',
        signedUrl: null,
        textContent: null,
        loading: false,
        error: err.message || 'Unable to generate temporary signed URL.'
      });
    }
  };

  const closePreview = () => {
    if (previewState?.isObjectUrl && previewState.signedUrl) {
      try { URL.revokeObjectURL(previewState.signedUrl); } catch (e) {}
    }
    setPreviewState(null);
  };

  // Export / download original file preserving filename & extension
  const handleExportFile = async (file, e) => {
    if (e) e.stopPropagation();
    setExportingId(file.id);

    try {
      // Built-in example file
      if (file.source !== 'supabase') {
        let content = file.content;
        if (content === undefined) {
          const res = await api.getVaultFileById(file.id);
          content = res?.file?.content || '';
        }
        const blob = new Blob([content], { type: file.mimeType || 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showNotice('success', `Exported "${file.name}".`);
        return;
      }

      // Real Supabase Storage file: generate temporary download signed URL
      const res = await api.getVaultFileSignedUrl(file.id, 'download');
      const resolvedUrl = resolveAccessUrl(res.signedUrl);
      const isLocalRoute = res.signedUrl?.startsWith('/api/');

      if (isLocalRoute) {
        const token = sessionAuth.getToken();
        const dlRes = await fetch(resolvedUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (!dlRes.ok) throw new Error(`Download failed (HTTP ${dlRes.status})`);
        const blob = await dlRes.blob();
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objUrl;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
      } else {
        // Supabase signed URL with Content-Disposition: attachment; filename="<original>"
        const a = document.createElement('a');
        a.href = resolvedUrl;
        a.download = file.name;
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }

      showNotice('success', `Downloading "${file.name}" via temporary signed URL.`);
    } catch (err) {
      showNotice('error', `Export failed for "${file.name}": ${err.message}`);
    } finally {
      setExportingId(null);
    }
  };

  // Delete file handler (confirmed via dark confirmation dialog)
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.deleteVaultFile(deleteTarget.id);
      setFiles((prev) => prev.filter((f) => f.id !== deleteTarget.id));
      if (previewState?.file?.id === deleteTarget.id) {
        closePreview();
      }
      showNotice('success', `"${deleteTarget.name}" permanently deleted.`);
      setDeleteTarget(null);
    } catch (err) {
      showNotice('error', `Failed to delete "${deleteTarget.name}": ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleUploadComplete = async (uploadedFiles, failedCount) => {
    await loadFiles();
    if (uploadedFiles.length > 0 && failedCount === 0) {
      showNotice(
        'success',
        uploadedFiles.length === 1
          ? `"${uploadedFiles[0].name}" uploaded to private vault.`
          : `${uploadedFiles.length} files uploaded to private vault.`
      );
    } else if (uploadedFiles.length > 0 && failedCount > 0) {
      showNotice(
        'success',
        `${uploadedFiles.length} file(s) uploaded; ${failedCount} failed.`
      );
    }
  };

  const handleCopyPreviewText = () => {
    if (!previewState?.textContent) return;
    navigator.clipboard.writeText(previewState.textContent);
    setCopiedPreview(true);
    setTimeout(() => setCopiedPreview(false), 2000);
  };

  // Filter files by search (name, category, description) & selected category
  const filteredFiles = files.filter((f) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      (f.name || '').toLowerCase().includes(q) ||
      (f.category || '').toLowerCase().includes(q) ||
      (f.description || '').toLowerCase().includes(q);
    const matchesCategory = selectedCategory === 'ALL' || f.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = ['ALL', ...new Set(files.map((f) => f.category).filter(Boolean))];

  return (
    <div className="rounded-xl border border-zinc-800 bg-[#0e0e11] overflow-hidden">
      {/* Header Bar */}
      <div className="p-4 border-b border-zinc-800 bg-[#121216] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <FolderLock className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
            {title} ({filteredFiles.length})
          </span>
        </div>

        {/* Search, Category Filter, and Prominent + Add File Button */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:flex-initial sm:w-48">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md pl-8 pr-2.5 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs font-mono text-zinc-300 focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="px-3.5 py-1.5 rounded-md bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-xs font-semibold text-white flex items-center space-x-1.5 shadow-sm shadow-cyan-950/60 transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add File</span>
          </button>
        </div>
      </div>

      {/* Inline Toast Notification */}
      {notification && (
        <div
          className={`px-4 py-2.5 border-b text-xs font-mono flex items-center justify-between gap-2 ${
            notification.type === 'error'
              ? 'bg-rose-950/40 border-rose-900/70 text-rose-300'
              : 'bg-emerald-950/40 border-emerald-900/70 text-emerald-300'
          }`}
        >
          <div className="flex items-center space-x-2">
            {notification.type === 'error' ? (
              <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="p-0.5 rounded hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Migration Notice (only if Supabase table hasn't been created yet) */}
      {migrationRequired && (
        <div className="px-4 py-2.5 border-b border-amber-900/60 bg-amber-950/30 text-amber-300 text-[11px] font-mono flex items-center space-x-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>
            Supabase table <strong className="text-amber-200">public.vault_files</strong> is not initialized yet. Run{' '}
            <code className="text-amber-100">supabase/migrations/20261118000000_add_vault_files.sql</code> in Supabase SQL Editor to persist uploaded files.
          </span>
        </div>
      )}

      {/* Files List */}
      {isLoading ? (
        <div className="p-10 text-center text-zinc-500 text-xs font-mono flex items-center justify-center space-x-2">
          <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
          <span>Loading confidential directory files...</span>
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="p-10 text-center space-y-3">
          <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 mx-auto flex items-center justify-center text-zinc-500">
            <FolderLock className="w-5 h-5" />
          </div>
          <div className="text-xs font-mono text-zinc-400">
            {files.length === 0
              ? 'Your Confidential Vault is currently empty.'
              : 'No files found matching your search or category filter.'}
          </div>
          {files.length === 0 && (
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Upload Your First File</span>
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-zinc-800/80">
          {filteredFiles.map((file) => {
            const { Icon, color } = getVaultFileIcon(file.name, file.mimeType);
            const isSupabaseFile = file.source === 'supabase';
            const isExporting = exportingId === file.id;

            return (
              <div
                key={file.id}
                onClick={() => handleViewFile(file)}
                className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-900/50 transition-colors cursor-pointer group"
              >
                <div className="flex items-center space-x-3.5 min-w-0">
                  <div className={`w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-700/80 flex items-center justify-center group-hover:border-cyan-800 transition-colors shrink-0 ${color}`}>
                    <Icon className="w-4 h-4" />
                  </div>

                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate group-hover:text-cyan-300 transition-colors flex items-center flex-wrap gap-2">
                      <span className="truncate">{file.name}</span>
                      {isSupabaseFile ? (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/70 text-emerald-400 border border-emerald-800/70 shrink-0">
                          Private Storage
                        </span>
                      ) : file.encrypted ? (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-emerald-400 border border-emerald-900/60 shrink-0">
                          AES-256
                        </span>
                      ) : null}
                    </div>

                    <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                      Category: {file.category} • Size: {file.size} • Updated {file.updatedAt}
                    </div>

                    {file.description && (
                      <div className="text-[10px] text-zinc-400 font-sans mt-0.5 truncate max-w-xl">
                        {file.description}
                      </div>
                    )}
                  </div>
                </div>

                {/* Row Actions: View, Export, Delete */}
                <div
                  className="flex items-center space-x-2 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => handleViewFile(file)}
                    className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-mono text-zinc-300 hover:text-cyan-300 flex items-center space-x-1 transition-colors cursor-pointer"
                    title="View File"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View</span>
                  </button>

                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={(e) => handleExportFile(file, e)}
                    className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-mono text-zinc-300 hover:text-emerald-300 flex items-center space-x-1 transition-colors disabled:opacity-50 cursor-pointer"
                    title="Export Original File"
                  >
                    {isExporting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>Export</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeleteTarget(file)}
                    className="p-1.5 rounded bg-zinc-900 hover:bg-rose-950/70 border border-zinc-800 hover:border-rose-800/80 text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
                    title="Delete File"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Modal */}
      <VaultUploadModal
        isOpen={showUploadModal}
        maxFileSizeMb={maxFileSizeMb}
        onClose={() => setShowUploadModal(false)}
        onUploadComplete={handleUploadComplete}
      />

      {/* File Preview Modal */}
      {previewState && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-zinc-700 bg-[#0e0e14] shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between gap-3 bg-zinc-950">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-cyan-400 shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white tracking-tight truncate">
                    {previewState.file.name}
                  </h3>
                  <div className="text-[10px] font-mono text-zinc-400 truncate">
                    Category: {previewState.file.category} • Size: {previewState.file.size} • Type: {previewState.file.mimeType || 'Unknown'}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                {previewState.kind === 'text' && previewState.textContent !== null && (
                  <button
                    type="button"
                    onClick={handleCopyPreviewText}
                    className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-mono text-zinc-200 flex items-center space-x-1.5 transition-colors cursor-pointer"
                  >
                    {copiedPreview ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedPreview ? 'Copied' : 'Copy'}</span>
                  </button>
                )}

                {previewState.signedUrl && !previewState.isObjectUrl && (
                  <a
                    href={previewState.signedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-mono text-zinc-200 flex items-center space-x-1.5 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="hidden sm:inline">Open Tab</span>
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => handleExportFile(previewState.file)}
                  className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-mono text-zinc-200 flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Export</span>
                </button>

                <button
                  type="button"
                  onClick={closePreview}
                  className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-4 flex-1 overflow-y-auto bg-[#08080a]">
              {previewState.loading ? (
                <div className="py-16 flex flex-col items-center justify-center text-zinc-400 text-xs font-mono space-y-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" />
                  <span>Generating temporary signed access URL...</span>
                </div>
              ) : previewState.error ? (
                <div className="py-12 text-center space-y-3">
                  <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
                  <p className="text-xs font-mono text-rose-300 max-w-md mx-auto">
                    {previewState.error}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleExportFile(previewState.file)}
                    className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Original File</span>
                  </button>
                </div>
              ) : previewState.kind === 'image' && previewState.signedUrl ? (
                <div className="flex items-center justify-center p-2">
                  <img
                    src={previewState.signedUrl}
                    alt={previewState.file.name}
                    className="max-h-[65vh] max-w-full rounded-lg border border-zinc-800 object-contain"
                  />
                </div>
              ) : previewState.kind === 'pdf' && previewState.signedUrl ? (
                <iframe
                  src={previewState.signedUrl}
                  title={previewState.file.name}
                  className="w-full h-[65vh] rounded-lg border border-zinc-800 bg-zinc-900"
                />
              ) : previewState.kind === 'video' && previewState.signedUrl ? (
                <div className="flex items-center justify-center">
                  <video
                    src={previewState.signedUrl}
                    controls
                    className="max-h-[65vh] max-w-full rounded-lg border border-zinc-800"
                  />
                </div>
              ) : previewState.kind === 'audio' && previewState.signedUrl ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-4">
                  <Music className="w-10 h-10 text-cyan-400" />
                  <audio src={previewState.signedUrl} controls className="w-full max-w-md" />
                </div>
              ) : previewState.kind === 'text' ? (
                <div className="space-y-2">
                  {previewState.file.source === 'supabase' && (
                    <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 flex items-center space-x-1.5">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Loaded via Temporary Signed URL</span>
                    </div>
                  )}
                  <pre className="p-4 rounded-xl bg-black/60 border border-zinc-800/80 font-mono text-xs text-zinc-200 overflow-x-auto whitespace-pre-wrap leading-relaxed select-text">
                    {previewState.textContent || '// Empty file'}
                  </pre>
                </div>
              ) : (
                <div className="py-12 text-center space-y-4">
                  <div className="w-14 h-14 rounded-xl bg-zinc-900 border border-zinc-800 mx-auto flex items-center justify-center text-cyan-400">
                    <GenericFileIcon className="w-7 h-7" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-white">
                      Inline Preview Unavailable for This Format
                    </h4>
                    <p className="text-xs font-mono text-zinc-400 max-w-md mx-auto">
                      Browser preview is not supported for <strong className="text-zinc-200">{previewState.file.name}</strong> ({previewState.file.mimeType || 'binary file'}). Export the file to open it locally in its native application.
                    </p>
                  </div>
                  {previewState.file.description && (
                    <p className="text-xs text-zinc-400 max-w-md mx-auto bg-zinc-900/70 border border-zinc-800 rounded-lg p-3">
                      {previewState.file.description}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => handleExportFile(previewState.file)}
                    className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white shadow-lg shadow-cyan-950/50 transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export Original File ({previewState.file.size})</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-[#0e0e14] shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-rose-400">
                <Trash2 className="w-4 h-4" />
                <h3 className="text-sm font-bold text-white">Confirm Permanent Deletion</h3>
              </div>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
                className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <p className="text-zinc-300 leading-relaxed">
                Are you sure you want to permanently delete{' '}
                <strong className="text-white font-mono break-all">{deleteTarget.name}</strong>?
              </p>
              <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-900/60 text-rose-300 font-mono text-[11px]">
                {deleteTarget.source === 'supabase'
                  ? 'This will remove both the stored file from private Supabase Storage and its metadata record from vault_files. This action cannot be undone.'
                  : 'This will remove the file from the vault directory.'}
              </div>
            </div>

            <div className="p-4 border-t border-zinc-800 bg-zinc-950 flex items-center justify-end space-x-2.5">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white flex items-center space-x-1.5 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete File</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
