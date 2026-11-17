import React, { useState, useEffect } from 'react';
import { Settings, ShieldCheck, Sliders, Check, RefreshCw, AlertCircle } from 'lucide-react';
import { api } from '../services/api';

export default function SettingsView() {
  const [config, setConfig] = useState({
    MATCH_THRESHOLD: 70,
    PIN_MAX_ATTEMPTS: 3,
    PIN_LOCKOUT_DURATION_SEC: 300,
    CHALLENGE_TTL_SEC: 90,
    AUTO_LOCK_DURATION_SEC: 5
  });

  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const loadSettings = async () => {
    try {
      setLoading(true);
      const res = await api.getSettings();
      if (res && res.settings) {
        setConfig(res.settings);
      }
    } catch (e) {
      console.warn('Could not load settings from backend:', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async () => {
    setErrorMsg('');
    try {
      setLoading(true);
      const res = await api.updateSettings({
        matchThreshold: config.MATCH_THRESHOLD,
        pinMaxAttempts: config.PIN_MAX_ATTEMPTS,
        challengeTtlSec: config.CHALLENGE_TTL_SEC,
        autoLockDurationSec: config.AUTO_LOCK_DURATION_SEC,
        lockoutDurationSec: config.PIN_LOCKOUT_DURATION_SEC
      });
      if (res && res.settings) {
        setConfig(res.settings);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to update settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      
      {/* Header */}
      <div className="pro-card p-4 border border-zinc-800 bg-[#101014] flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-300">
            <Settings className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">
              Security Policy & Actuator Parameters
            </h2>
            <p className="text-xs font-mono text-zinc-500">
              Trusted backend rate limiting, timeouts, and biometric thresholds
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={loading}
          className="px-4 py-2 rounded-md font-sans font-semibold text-xs text-black bg-cyan-400 hover:bg-cyan-300 transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
        >
          {saved ? <Check className="w-3.5 h-3.5 text-black" /> : null}
          <span>{saved ? 'Saved to Backend' : 'Save Parameters'}</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 rounded bg-rose-950/40 border border-rose-800 text-rose-300 font-mono text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        
        {/* Biometric Thresholds */}
        <div className="pro-card p-5 border border-zinc-800 bg-[#101014] space-y-4 font-mono text-xs">
          <div className="text-zinc-200 font-semibold flex items-center space-x-2 border-b border-zinc-800/80 pb-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span>Biometric Morphological Verification</span>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-zinc-400 mb-1.5">
                <span>Morphology Acceptance Threshold:</span>
                <span className="text-cyan-400 font-bold">{config.MATCH_THRESHOLD}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="95"
                value={config.MATCH_THRESHOLD}
                onChange={(e) => setConfig({ ...config, MATCH_THRESHOLD: Number(e.target.value) })}
                className="w-full accent-cyan-400 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-zinc-600 mt-0.5">
                <span>50% (Permissive)</span>
                <span>70% (Standard)</span>
                <span>95% (Strict)</span>
              </div>
            </div>

            <div>
              <label className="text-zinc-400 block mb-1">Step 2 Challenge Validity TTL</label>
              <select
                value={config.CHALLENGE_TTL_SEC}
                onChange={(e) => setConfig({ ...config, CHALLENGE_TTL_SEC: Number(e.target.value) })}
                className="w-full bg-[#0a0a0c] border border-zinc-800 rounded px-2.5 py-2 text-white focus:outline-none focus:border-cyan-500"
              >
                <option value={45}>45 Seconds (High Security)</option>
                <option value={90}>90 Seconds (Standard)</option>
                <option value={180}>180 Seconds (Extended)</option>
              </select>
              <span className="text-[10px] text-zinc-500 mt-1 block">
                Window in which valid biometric success can authorize PIN verification.
              </span>
            </div>
          </div>
        </div>

        {/* Rate Limiting & Lockout */}
        <div className="pro-card p-5 border border-zinc-800 bg-[#101014] space-y-4 font-mono text-xs">
          <div className="text-zinc-200 font-semibold flex items-center space-x-2 border-b border-zinc-800/80 pb-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span>Vault PIN Protection & Lockout</span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-zinc-400 block mb-1">Max Consecutive Failed PIN Attempts</label>
              <input
                type="number"
                min="1"
                max="10"
                value={config.PIN_MAX_ATTEMPTS}
                onChange={(e) => setConfig({ ...config, PIN_MAX_ATTEMPTS: Number(e.target.value) })}
                className="w-full bg-[#0a0a0c] border border-zinc-800 rounded px-2.5 py-2 text-white focus:outline-none focus:border-cyan-500"
              />
              <span className="text-[10px] text-zinc-500 mt-1 block">
                Exceeding this count triggers automatic account & actuator lockout.
              </span>
            </div>

            <div>
              <label className="text-zinc-400 block mb-1">Temporary Lockout Duration</label>
              <select
                value={config.PIN_LOCKOUT_DURATION_SEC}
                onChange={(e) => setConfig({ ...config, PIN_LOCKOUT_DURATION_SEC: Number(e.target.value) })}
                className="w-full bg-[#0a0a0c] border border-zinc-800 rounded px-2.5 py-2 text-white focus:outline-none focus:border-cyan-500"
              >
                <option value={60}>1 Minute</option>
                <option value={300}>5 Minutes (Standard)</option>
                <option value={600}>10 Minutes</option>
              </select>
            </div>

            <div>
              <label className="text-zinc-400 block mb-1">Servo Deadbolt Auto-Relock Timer</label>
              <select
                value={config.AUTO_LOCK_DURATION_SEC}
                onChange={(e) => setConfig({ ...config, AUTO_LOCK_DURATION_SEC: Number(e.target.value) })}
                className="w-full bg-[#0a0a0c] border border-zinc-800 rounded px-2.5 py-2 text-white focus:outline-none focus:border-cyan-500"
              >
                <option value={3}>3 Seconds</option>
                <option value={5}>5 Seconds (Standard)</option>
                <option value={10}>10 Seconds</option>
              </select>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
