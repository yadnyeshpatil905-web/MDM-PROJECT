import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Usb, 
  Unplug, 
  Volume2, 
  VolumeX, 
  Circle,
  Activity
} from 'lucide-react';
import { sounds } from '../audio/soundEffects';

export default function Header({ 
  isHardwareConnected = false,
  onConnectHardware = () => {},
  onDisconnectHardware = () => {},
  activeMode = 'AUTHENTICATION',
  onToggleMode = () => {}
}) {
  const [timeStr, setTimeStr] = useState('');
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('en-US', { hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const toggleMute = () => {
    sounds.muted = !sounds.muted;
    setIsMuted(sounds.muted);
  };

  return (
    <header className="h-14 border-b border-zinc-800/80 bg-zinc-950 px-6 flex items-center justify-between sticky top-0 z-50">
      
      {/* Brand & Project Identity */}
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-700/60 flex items-center justify-center">
          <Shield className="w-4 h-4 text-zinc-200" />
        </div>
        <div className="flex items-center space-x-2.5">
          <h1 className="font-sans font-semibold text-sm tracking-tight text-white">
            Smart Credential Lock
          </h1>
          <span className="text-[11px] font-mono text-zinc-400 border-l border-zinc-800 pl-2.5">
            PPG Biometric System
          </span>
        </div>
      </div>

      {/* Center Hardware Telemetry & Connection */}
      <div className="flex items-center space-x-3">
        {/* USB Connection Pill */}
        {!isHardwareConnected ? (
          <button
            onClick={onConnectHardware}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
          >
            <Usb className="w-3.5 h-3.5 text-zinc-400" />
            <span>Connect Arduino UNO</span>
          </button>
        ) : (
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-md bg-zinc-900 border border-emerald-900/60 text-xs text-zinc-300">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="font-mono text-[11px]">Arduino UNO (9600 Baud)</span>
            <button
              onClick={onDisconnectHardware}
              title="Disconnect"
              className="text-zinc-500 hover:text-zinc-300 ml-1"
            >
              <Unplug className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Mode Toggle */}
        <div className="flex items-center bg-zinc-900 p-0.5 rounded-md border border-zinc-800 text-xs font-medium">
          <button
            onClick={() => onToggleMode('AUTHENTICATION')}
            className={`px-2.5 py-1 rounded transition-colors ${
              activeMode === 'AUTHENTICATION'
                ? 'bg-zinc-800 text-white font-medium'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Auth Mode
          </button>
          <button
            onClick={() => onToggleMode('ENROLLMENT')}
            className={`px-2.5 py-1 rounded transition-colors ${
              activeMode === 'ENROLLMENT'
                ? 'bg-zinc-800 text-white font-medium'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Enroll Mode
          </button>
        </div>
      </div>

      {/* Right Controls & Clock */}
      <div className="flex items-center space-x-3">
        {/* Audio Mute Toggle */}
        <button
          onClick={toggleMute}
          title={isMuted ? "Unmute audio" : "Mute audio"}
          className="p-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          {isMuted ? <VolumeX className="w-3.5 h-3.5 text-zinc-500" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>

        {/* Minimal Digital Clock */}
        <div className="font-mono text-xs text-zinc-400 bg-zinc-900 px-2.5 py-1 rounded-md border border-zinc-800">
          {timeStr || '00:00:00'}
        </div>
      </div>

    </header>
  );
}
