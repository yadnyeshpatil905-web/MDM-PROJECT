import React, { useState } from 'react';
import {
  FolderLock,
  FolderKey,
  Lock,
  ShieldCheck,
  Key,
  Plus,
  X,
  FolderOpen,
  ArrowRight,
  Clock
} from 'lucide-react';
import { api } from '../services/api';
import VaultFileDirectory from '../components/VaultFileDirectory';

export default function VaultFolderView({
  isVaultUnlocked = false,
  authenticatedUser = null,
  vaultSession = null,
  servoAngle = 0,
  onLockVault = () => {},
  onOpenAuth = () => {}
}) {
  const [refreshTick, setRefreshTick] = useState(0);

  // Optional quick text-note creation modal (preserves existing quick note flow)
  const [showAddNoteModal, setShowAddNoteModal] = useState(false);
  const [newFileForm, setNewFileForm] = useState({
    name: '',
    category: 'Confidential Credentials',
    content: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateNote = async (e) => {
    e.preventDefault();
    if (!newFileForm.name.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await api.createVaultFile(newFileForm);
      if (res && res.file) {
        setShowAddNoteModal(false);
        setNewFileForm({ name: '', category: 'Confidential Credentials', content: '' });
        setRefreshTick((prev) => prev + 1);
      }
    } catch (err) {
      alert(`Failed to save secret note: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // If vault is locked, present the secure gateway screen
  if (!isVaultUnlocked) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 py-4">
        {/* Locked Gateway Banner */}
        <div className="rounded-xl border border-zinc-800 bg-[#0e0e11] p-8 md:p-12 text-center relative overflow-hidden shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-b from-rose-500/5 via-transparent to-transparent pointer-events-none" />

          <div className="w-16 h-16 rounded-xl bg-zinc-900 border border-zinc-700/80 mx-auto flex items-center justify-center text-rose-400 shadow-inner mb-6">
            <FolderLock className="w-8 h-8 text-rose-400" />
          </div>

          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs font-mono mb-3">
            <Lock className="w-3.5 h-3.5" />
            <span>CONFIDENTIAL VAULT & FOLDERS • PRIVATE & LOCKED</span>
          </div>

          <h2 className="text-2xl font-extrabold text-white tracking-tight">
            Multi-Authenticator Security Gate
          </h2>

          <p className="text-zinc-400 max-w-xl mx-auto mt-3 text-sm leading-relaxed font-sans">
            This secure folder contains confidential credentials, cryptographic root keys, and private uploaded files.
            Access requires two-factor verification: your <strong className="text-white">enrolled fingerprint</strong> and secret <strong className="text-white">vault PIN</strong>.
          </p>

          {/* 2-Factor Requirement Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-lg mx-auto my-8 text-left">
            <div className="p-4 rounded-xl border border-zinc-800 bg-[#121216]">
              <div className="flex items-center space-x-2 text-cyan-400 font-medium text-xs font-mono uppercase mb-1">
                <span>1. Biometric Fingerprint</span>
              </div>
              <p className="text-xs text-zinc-400">
                HW-827 PPG optical pulse morphology matching (≥ 70% correlation threshold).
              </p>
            </div>

            <div className="p-4 rounded-xl border border-zinc-800 bg-[#121216]">
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
            className="inline-flex items-center space-x-2.5 px-6 py-3.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold text-sm shadow-lg shadow-cyan-900/30 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            <FolderKey className="w-5 h-5" />
            <span>Authenticate with Fingerprint & PIN to Open Vault</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </button>
        </div>

        {/* Security Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
          <div className="p-4 rounded-xl border border-zinc-800 bg-[#101014] text-zinc-400 space-y-1">
            <div className="text-zinc-300 font-semibold flex items-center space-x-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Fail-Closed Deadbolt</span>
            </div>
            <p className="text-zinc-500">Hardware servo angle: {servoAngle}° (Engaged). Vault opens solely upon complete 2FA authorization.</p>
          </div>

          <div className="p-4 rounded-xl border border-zinc-800 bg-[#101014] text-zinc-400 space-y-1">
            <div className="text-zinc-300 font-semibold flex items-center space-x-1.5">
              <Key className="w-4 h-4 text-amber-400" />
              <span>Multi-Factor Isolation</span>
            </div>
            <p className="text-zinc-500">Biometric alone or PIN alone cannot unlock the vault. Both must be validated in sequence.</p>
          </div>

          <div className="p-4 rounded-xl border border-zinc-800 bg-[#101014] text-zinc-400 space-y-1">
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
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Access Granted Header Banner */}
      <div className="rounded-xl border border-emerald-800/60 bg-[#0e0e11] p-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-950 border border-emerald-700/80 flex items-center justify-center text-emerald-400 shadow-inner">
            <FolderOpen className="w-6 h-6 text-emerald-400" />
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
            <h2 className="text-xl font-bold text-white tracking-tight mt-1 flex items-center space-x-2">
              <span>Confidential Secure Directory</span>
            </h2>
            <p className="text-xs text-zinc-400">
              Authenticated Operator: <strong className="text-emerald-300">{authenticatedUser?.fullName || 'Authorized User'}</strong> • Upload, view, export, or delete your private vault files below.
            </p>
          </div>
        </div>

        {/* Lock Vault & Quick Note Actions */}
        <div className="flex items-center space-x-3 w-full md:w-auto">
          <button
            onClick={() => setShowAddNoteModal(true)}
            className="flex-1 md:flex-initial inline-flex items-center justify-center space-x-1.5 px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-semibold text-white transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 text-cyan-400" />
            <span>New Text Note</span>
          </button>

          <button
            onClick={onLockVault}
            className="flex-1 md:flex-initial inline-flex items-center justify-center space-x-1.5 px-4 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white shadow-lg shadow-rose-900/40 transition-colors cursor-pointer"
          >
            <Lock className="w-4 h-4" />
            <span>Relock Vault</span>
          </button>
        </div>
      </div>

      {/* Unified Confidential Vault Files Directory (Supabase Storage + Example Files) */}
      <VaultFileDirectory
        isUnlocked={isVaultUnlocked}
        refreshTrigger={refreshTick}
        title="Confidential Vault Files Directory"
      />

      {/* Quick Text Note Modal */}
      {showAddNoteModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-[#0e0e14] shadow-2xl overflow-hidden">
            <form onSubmit={handleCreateNote}>
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
                <div className="flex items-center space-x-2">
                  <Plus className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-sm font-bold text-white">Create Text Secret Note</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddNoteModal(false)}
                  className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
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
                    <option value="General Vault">General Vault</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 font-mono mb-1">Secret Content</label>
                  <textarea
                    rows={6}
                    placeholder="Enter confidential notes, API keys, or credentials..."
                    value={newFileForm.content}
                    onChange={(e) => setNewFileForm({ ...newFileForm, content: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-500 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="p-4 border-t border-zinc-800 bg-zinc-950 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAddNoteModal(false)}
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs text-white font-semibold flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{isSubmitting ? 'Saving...' : 'Save Note'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
