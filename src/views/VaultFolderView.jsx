import React, { useState, useEffect } from 'react';
import { 
  FolderLock, 
  FolderKey, 
  Lock, 
  Unlock, 
  ShieldCheck, 
  FileText, 
  FileCode, 
  FileSpreadsheet, 
  Key, 
  Download, 
  Trash2, 
  Plus, 
  Eye, 
  X, 
  Search, 
  Copy, 
  Check, 
  AlertTriangle,
  FolderOpen,
  ArrowRight,
  RefreshCw,
  Clock
} from 'lucide-react';
import { api } from '../services/api';

export default function VaultFolderView({
  isVaultUnlocked = false,
  authenticatedUser = null,
  vaultSession = null,
  servoAngle = 0,
  onLockVault = () => {},
  onOpenAuth = () => {}
}) {
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  
  // Selected file for preview modal
  const [activeFile, setActiveFile] = useState(null);
  const [copied, setCopied] = useState(false);

  // New file creation modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newFileForm, setNewFileForm] = useState({
    name: '',
    category: 'Confidential Credentials',
    content: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch files from backend
  const loadFiles = async () => {
    setIsLoading(true);
    try {
      const res = await api.getVaultFiles();
      if (res && res.files) {
        setFiles(res.files);
      }
    } catch (err) {
      console.warn('Could not load vault files:', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, [isVaultUnlocked]);

  // Open file preview and fetch content
  const handleOpenFile = async (fileSummary) => {
    try {
      const res = await api.getVaultFileById(fileSummary.id);
      if (res && res.file) {
        setActiveFile(res.file);
      } else {
        setActiveFile(fileSummary);
      }
    } catch (err) {
      setActiveFile(fileSummary);
    }
  };

  // Delete file
  const handleDeleteFile = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this secret from the vault?')) return;
    try {
      await api.deleteVaultFile(id);
      setFiles(prev => prev.filter(f => f.id !== id));
      if (activeFile && activeFile.id === id) setActiveFile(null);
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  // Create new file
  const handleCreateFile = async (e) => {
    e.preventDefault();
    if (!newFileForm.name.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await api.createVaultFile(newFileForm);
      if (res && res.file) {
        setFiles(prev => [res.file, ...prev]);
        setShowAddModal(false);
        setNewFileForm({ name: '', category: 'Confidential Credentials', content: '' });
      }
    } catch (err) {
      alert(`Failed to save file: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyContent = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadFile = (file, e) => {
    if (e) e.stopPropagation();
    const element = document.createElement('a');
    const blob = new Blob([file.content || ''], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(blob);
    element.download = file.name;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Filtered files
  const filteredFiles = files.filter(f => {
    const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          f.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'ALL' || f.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = ['ALL', ...new Set(files.map(f => f.category))];

  const getFileIcon = (mimeType, name) => {
    if (name.endsWith('.json') || name.endsWith('.cad')) return FileCode;
    if (name.endsWith('.pem') || name.endsWith('.key') || name.endsWith('.env')) return Key;
    if (name.endsWith('.csv') || name.endsWith('.xlsx')) return FileSpreadsheet;
    return FileText;
  };

  // If vault is locked, present the secure gateway screen
  if (!isVaultUnlocked) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 py-4">
        {/* Locked Gateway Banner */}
        <div className="rounded-2xl border border-zinc-800 bg-[#0d0d12] p-8 md:p-12 text-center relative overflow-hidden shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-b from-rose-500/5 via-transparent to-transparent pointer-events-none" />
          
          <div className="w-20 h-20 rounded-2xl bg-zinc-900 border border-zinc-700/80 mx-auto flex items-center justify-center text-rose-400 shadow-inner mb-6">
            <FolderLock className="w-10 h-10 text-rose-400" />
          </div>

          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs font-mono mb-3">
            <Lock className="w-3.5 h-3.5" />
            <span>CONFIDENTIAL VAULT & FOLDERS • ENCRYPTED & LOCKED</span>
          </div>

          <h2 className="text-3xl font-extrabold text-white tracking-tight">
            Multi-Authenticator Security Gate
          </h2>

          <p className="text-zinc-400 max-w-xl mx-auto mt-3 text-sm leading-relaxed">
            This secure folder contains confidential credentials, cryptographic root keys, and private system records.
            Access requires two-factor verification: your <strong className="text-white">enrolled fingerprint</strong> and secret <strong className="text-white">vault PIN</strong>.
          </p>

          {/* 2-Factor Requirement Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-lg mx-auto my-8 text-left">
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60">
              <div className="flex items-center space-x-2 text-cyan-400 font-medium text-xs font-mono uppercase mb-1">
                <span>1. Biometric Fingerprint</span>
              </div>
              <p className="text-xs text-zinc-400">
                HW-827 PPG optical pulse morphology matching (≥ 70% correlation threshold).
              </p>
            </div>

            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60">
              <div className="flex items-center space-x-2 text-amber-400 font-medium text-xs font-mono uppercase mb-1">
                <span>2. Vault Security PIN</span>
              </div>
              <p className="text-xs text-zinc-400">
                Salted Scrypt hash verification with brute-force lockout protection.
              </p>
            </div>
          </div>

          {/* Unlock CTA Button */}
          <button
            onClick={onOpenAuth}
            className="inline-flex items-center space-x-2.5 px-6 py-3.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold text-sm shadow-lg shadow-cyan-900/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <FolderKey className="w-5 h-5" />
            <span>Authenticate with Fingerprint & PIN to Open Vault</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </button>
        </div>

        {/* Security Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
          <div className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-950/70 text-zinc-400 space-y-1">
            <div className="text-zinc-300 font-semibold flex items-center space-x-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Fail-Closed Deadbolt</span>
            </div>
            <p className="text-zinc-500">Hardware servo angle: {servoAngle}° (Engaged). Vault opens solely upon complete 2FA authorization.</p>
          </div>

          <div className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-950/70 text-zinc-400 space-y-1">
            <div className="text-zinc-300 font-semibold flex items-center space-x-1.5">
              <Key className="w-4 h-4 text-amber-400" />
              <span>Multi-Factor Isolation</span>
            </div>
            <p className="text-zinc-500">Biometric alone or PIN alone cannot unlock the vault. Both must be validated in sequence.</p>
          </div>

          <div className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-950/70 text-zinc-400 space-y-1">
            <div className="text-zinc-300 font-semibold flex items-center space-x-1.5">
              <Clock className="w-4 h-4 text-cyan-400" />
              <span>Challenge Expiry</span>
            </div>
            <p className="text-zinc-500">Step 1 biometric challenge token expires after 90 seconds to prevent session hijacking.</p>
          </div>
        </div>
      </div>
    );
  }

  // Vault is UNLOCKED: Display the rich confidential files and folders explorer
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      
      {/* Access Granted Header Banner */}
      <div className="rounded-xl border border-emerald-800/60 bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-zinc-950 p-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 rounded-xl bg-emerald-950 border border-emerald-700/80 flex items-center justify-center text-emerald-400 shadow-inner">
            <FolderOpen className="w-8 h-8 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-mono uppercase font-bold text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                VAULT & FOLDER UNLOCKED • 2FA VERIFIED
              </span>
              <span className="text-xs font-mono text-zinc-400">
                Servo Actuator: {servoAngle}° (Retracted)
              </span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight mt-1 flex items-center space-x-2">
              <span>Confidential Secure Directory</span>
            </h2>
            <p className="text-xs text-zinc-400">
              Authenticated Operator: <strong className="text-emerald-300">{authenticatedUser?.fullName || 'Authorized User'}</strong> • All protected files and secrets are decrypted.
            </p>
          </div>
        </div>

        {/* Lock Vault & Action Buttons */}
        <div className="flex items-center space-x-3 w-full md:w-auto">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex-1 md:flex-initial inline-flex items-center justify-center space-x-1.5 px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-semibold text-white transition-colors"
          >
            <Plus className="w-4 h-4 text-cyan-400" />
            <span>New Secret File</span>
          </button>

          <button
            onClick={onLockVault}
            className="flex-1 md:flex-initial inline-flex items-center justify-center space-x-1.5 px-4 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white shadow-lg shadow-rose-900/40 transition-colors"
          >
            <Lock className="w-4 h-4" />
            <span>Relock Vault</span>
          </button>
        </div>
      </div>

      {/* Directory Navigation & Filters */}
      <div className="pro-card p-4 border border-zinc-800 bg-[#0e0e12] flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search vault files or secrets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Category Pills */}
        <div className="flex items-center space-x-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-md text-[11px] font-mono whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-800 font-semibold'
                  : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Vault Files Table / Grid */}
      <div className="rounded-xl border border-zinc-800 bg-[#0d0d12] overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-950/60 flex items-center justify-between text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
          <span>Confidential File Name ({filteredFiles.length})</span>
          <div className="flex items-center space-x-8">
            <span className="hidden md:inline">Category</span>
            <span className="hidden sm:inline">Size</span>
            <span>Actions</span>
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-zinc-500 text-xs font-mono flex items-center justify-center space-x-2">
            <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
            <span>Decrypting confidential vault files...</span>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 text-xs font-mono">
            No confidential files found matching criteria.
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/60">
            {filteredFiles.map((file) => {
              const Icon = getFileIcon(file.mimeType, file.name);
              return (
                <div
                  key={file.id}
                  onClick={() => handleOpenFile(file)}
                  className="px-5 py-4 flex items-center justify-between hover:bg-zinc-900/60 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center space-x-3.5 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-700/80 flex items-center justify-center text-zinc-300 group-hover:text-cyan-400 group-hover:border-cyan-800 transition-colors shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white truncate group-hover:text-cyan-300 transition-colors flex items-center space-x-2">
                        <span>{file.name}</span>
                        {file.encrypted && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-emerald-400 border border-emerald-900/60">
                            AES-256
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
                        Updated {file.updatedAt}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-6 shrink-0">
                    <span className="hidden md:inline text-xs font-mono text-zinc-400 bg-zinc-900/80 px-2 py-0.5 rounded border border-zinc-800">
                      {file.category}
                    </span>
                    <span className="hidden sm:inline text-xs font-mono text-zinc-500">
                      {file.size}
                    </span>
                    
                    <div className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleOpenFile(file)}
                        title="View / Decrypt Content"
                        className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-cyan-300 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      <button
                        onClick={(e) => handleDownloadFile(file, e)}
                        title="Export File"
                        className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-emerald-300 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                      </button>

                      <button
                        onClick={(e) => handleDeleteFile(file.id, e)}
                        title="Delete Secret"
                        className="p-1.5 rounded-md hover:bg-rose-950/60 text-zinc-500 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* File Preview Modal */}
      {activeFile && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-zinc-700 bg-[#0e0e14] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            
            {/* Modal Header */}
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-cyan-400">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">{activeFile.name}</h3>
                  <div className="text-[10px] font-mono text-zinc-400">
                    Category: {activeFile.category} • Size: {activeFile.size}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleCopyContent(activeFile.content)}
                  className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-mono text-zinc-200 flex items-center space-x-1.5 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>

                <button
                  onClick={() => handleDownloadFile(activeFile)}
                  className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-mono text-zinc-200 flex items-center space-x-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Download</span>
                </button>

                <button
                  onClick={() => setActiveFile(null)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Decrypted Content Box */}
            <div className="p-5 overflow-y-auto flex-1 font-mono text-xs bg-[#09090d]">
              <div className="text-[10px] uppercase tracking-wider text-emerald-400 mb-2 flex items-center space-x-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Decrypted Secret Stream (Multi-Authenticator Authorization Active)</span>
              </div>
              <pre className="p-4 rounded-xl bg-black/60 border border-zinc-800/80 text-zinc-200 overflow-x-auto whitespace-pre-wrap leading-relaxed select-text font-mono">
                {activeFile.content || '// Empty document'}
              </pre>
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-zinc-800/80 bg-zinc-950 flex justify-end">
              <button
                onClick={() => setActiveFile(null)}
                className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-white transition-colors"
              >
                Close Preview
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Add New Secret File Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-[#0e0e14] shadow-2xl overflow-hidden">
            <form onSubmit={handleCreateFile}>
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
                <div className="flex items-center space-x-2">
                  <Plus className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-sm font-bold text-white">Create Encrypted Vault File</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs font-sans">
                <div>
                  <label className="block text-zinc-400 font-mono mb-1">File Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Server_Root_Keys.env"
                    value={newFileForm.name}
                    onChange={(e) => setNewFileForm({ ...newFileForm, name: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-500 font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-mono mb-1">Folder Category</label>
                  <select
                    value={newFileForm.category}
                    onChange={(e) => setNewFileForm({ ...newFileForm, category: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-500 font-mono text-xs"
                  >
                    <option value="Confidential Credentials">Confidential Credentials</option>
                    <option value="Cryptographic Keys">Cryptographic Keys</option>
                    <option value="Financial Documents">Financial Documents</option>
                    <option value="Sensory Data">Sensory Data</option>
                    <option value="General Secrets">General Secrets</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 font-mono mb-1">Secret Content</label>
                  <textarea
                    rows={6}
                    placeholder="Enter confidential notes, API keys, or encrypted credentials..."
                    value={newFileForm.content}
                    onChange={(e) => setNewFileForm({ ...newFileForm, content: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-500 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="p-4 border-t border-zinc-800 bg-zinc-950 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs text-white font-semibold flex items-center space-x-1.5 disabled:opacity-50"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{isSubmitting ? 'Saving...' : 'Encrypt & Store'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
