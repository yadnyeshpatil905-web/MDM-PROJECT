import React, { useState } from 'react';
import { Settings, ShieldCheck, Sliders, Check } from 'lucide-react';

export default function SettingsView() {
  const [config, setConfig] = useState({
    matchThreshold: 70,
    captureDurationMs: 10000,
    minBeats: 5,
    autoLockDurationMs: 5000
  });

  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      
      {/* Header */}
      <div className="pro-card p-4 border border-zinc-800 bg-[#101014] flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-300">
            <Settings className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">
              System Parameters & Biometric Security
            </h2>
            <p className="text-xs font-mono text-zinc-500">
              Hardware thresholds and authentication configurations
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          className="px-4 py-2 rounded-md font-sans font-semibold text-xs text-black bg-white hover:bg-zinc-200 transition-colors flex items-center space-x-1.5"
        >
          {saved ? <Check className="w-3.5 h-3.5 text-black" /> : null}
          <span>{saved ? 'Saved' : 'Save Changes'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Thresholds */}
        <div className="pro-card p-4 border border-zinc-800 bg-[#101014] space-y-3 font-mono text-xs">
          <div className="text-zinc-200 font-semibold flex items-center space-x-1.5">
            <Sliders className="w-3.5 h-3.5 text-zinc-400" />
            <span>Biometric Parameters</span>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-zinc-400 mb-1">
                <span>Match Acceptance Threshold:</span>
                <span className="text-white font-bold">{config.matchThreshold}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="95"
                value={config.matchThreshold}
                onChange={(e) => setConfig({ ...config, matchThreshold: Number(e.target.value) })}
                className="w-full accent-white cursor-pointer"
              />
            </div>

            <div>
              <label className="text-zinc-400 block mb-1">Capture Window Duration</label>
              <select
                value={config.captureDurationMs}
                onChange={(e) => setConfig({ ...config, captureDurationMs: Number(e.target.value) })}
                className="w-full bg-[#0a0a0c] border border-zinc-800 rounded px-2.5 py-1.5 text-white focus:outline-none"
              >
                <option value={7000}>7 Seconds</option>
                <option value={10000}>10 Seconds (Standard)</option>
              </select>
            </div>

            <div>
              <label className="text-zinc-400 block mb-1">Minimum Heartbeats</label>
              <input
                type="number"
                value={config.minBeats}
                onChange={(e) => setConfig({ ...config, minBeats: Number(e.target.value) })}
                className="w-full bg-[#0a0a0c] border border-zinc-800 rounded px-2.5 py-1.5 text-white focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Security Policy */}
        <div className="pro-card p-4 border border-zinc-800 bg-[#101014] space-y-2 font-mono text-xs">
          <div className="text-zinc-200 font-semibold flex items-center space-x-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-zinc-400" />
            <span>Privacy & Template Security</span>
          </div>
          <p className="text-zinc-400 leading-relaxed text-[11px]">
            • Heart rate (BPM) alone is never used as an identity credential.<br/>
            • Identification relies strictly on the unique 20-point arterial pressure curve.<br/>
            • Raw optical voltage readings are processed directly in SRAM and never stored persistently.
          </p>
        </div>

      </div>

    </div>
  );
}
