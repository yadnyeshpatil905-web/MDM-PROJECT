import React, { useState } from 'react';
import { 
  Lock, 
  Unlock, 
  Play, 
  Square, 
  Usb, 
  Heart, 
  Activity, 
  ShieldCheck, 
  AlertCircle,
  Terminal,
  Layers,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import PpgWaveformCanvas from '../components/PpgWaveformCanvas';
import TemplateComparisonCard from '../components/TemplateComparisonCard';
import SerialConsole from '../components/SerialConsole';

export default function DashboardView({
  engineState = {},
  isHardwareConnected = false,
  onConnectHardware = () => {},
  onStart = () => {},
  onStop = () => {},
  serialLogs = [],
  onClearSerial = () => {},
  onSendSerial = () => {}
}) {
  const {
    state = 'DISCONNECTED',
    statusMessage = 'System Ready - Locked',
    servoAngle = 0,
    bpm = 0,
    beatCount = 0,
    signalQuality = 'READY',
    isRunning = false,
    waveBuffer = [],
    lcdLine1 = 'PPG BIOMETRIC',
    lcdLine2 = 'READY - LOCKED',
    enrolledTemplate = [],
    currentTemplate = [],
    matchScore = 0
  } = engineState;

  const [showAdvanced, setShowAdvanced] = useState(false);

  const isUnlocked = servoAngle > 45 || state === 'ACCESS_GRANTED';
  const isDenied = state === 'ACCESS_DENIED';
  const isDisconnected = state === 'DISCONNECTED';

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      
      {/* Unified Main Workspace Card */}
      <div className="rounded-xl border border-zinc-800 bg-[#0e0e11] overflow-hidden">
        
        {/* Section 1: Lock State & Control Header */}
        <div className="p-6 border-b border-zinc-800/80 flex flex-col md:flex-row items-center justify-between gap-6 bg-[#121216]">
          
          <div className="flex items-center space-x-4">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center border transition-colors ${
              isUnlocked ? 'bg-emerald-950/40 border-emerald-800 text-emerald-400' :
              isDenied ? 'bg-rose-950/40 border-rose-800 text-rose-400' :
              isDisconnected ? 'bg-zinc-900 border-zinc-800 text-zinc-500' :
              'bg-zinc-900 border-zinc-700 text-zinc-100'
            }`}>
              {isUnlocked ? (
                <Unlock className="w-6 h-6 text-emerald-400" />
              ) : isDenied ? (
                <AlertCircle className="w-6 h-6 text-rose-400" />
              ) : isDisconnected ? (
                <Usb className="w-6 h-6 text-zinc-500" />
              ) : (
                <Lock className="w-6 h-6 text-zinc-100" />
              )}
            </div>

            <div>
              <div className="flex items-center space-x-2">
                <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-semibold ${
                  isUnlocked ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800' :
                  isDenied ? 'bg-rose-950/80 text-rose-300 border border-rose-800' :
                  isDisconnected ? 'bg-zinc-900 text-zinc-500 border border-zinc-800' :
                  state === 'CAPTURING' ? 'bg-zinc-800 text-zinc-200 border border-zinc-700' :
                  'bg-zinc-900 text-zinc-400 border border-zinc-800'
                }`}>
                  {isUnlocked ? 'STATUS: UNLOCKED' :
                   isDenied ? 'STATUS: DENIED' :
                   isDisconnected ? 'STATUS: DISCONNECTED' :
                   state === 'CAPTURING' ? 'STATUS: MEASURING' : 'STATUS: LOCKED'}
                </span>
                <span className="text-xs font-mono text-zinc-500">
                  Servo: {servoAngle}°
                </span>
              </div>

              <h2 className="text-xl font-bold font-sans text-white tracking-tight mt-1">
                {isUnlocked ? 'Access Granted' : 
                 isDenied ? 'Verification Failed' : 
                 isDisconnected ? 'Connect Arduino Hardware' : 
                 state === 'CAPTURING' ? 'Reading PPG Biometrics' : 'Biometric Security Lock'}
              </h2>

              <p className="text-xs text-zinc-400 font-mono mt-0.5">
                {statusMessage}
              </p>
            </div>
          </div>

          {/* Primary Action Button */}
          <div>
            {isDisconnected ? (
              <button
                onClick={onStart}
                className="px-6 py-2.5 rounded-lg font-sans font-semibold text-xs text-black bg-white hover:bg-zinc-200 active:scale-95 transition-all flex items-center space-x-2 shadow-sm cursor-pointer"
              >
                <Usb className="w-3.5 h-3.5 text-black" />
                <span>Connect Arduino USB</span>
              </button>
            ) : !isRunning ? (
              <button
                onClick={onStart}
                className="px-6 py-2.5 rounded-lg font-sans font-semibold text-xs text-black bg-white hover:bg-zinc-200 active:scale-95 transition-all flex items-center space-x-2 shadow-sm cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Start PPG Scan</span>
              </button>
            ) : (
              <button
                onClick={onStop}
                className="px-5 py-2.5 rounded-lg font-sans font-medium text-xs text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-all flex items-center space-x-1.5"
              >
                <Square className="w-3.5 h-3.5 fill-current text-zinc-400" />
                <span>Reset Scan</span>
              </button>
            )}
          </div>

        </div>

        {/* Section 2: Seamless Embedded PPG Waveform */}
        <div className="p-6 bg-[#0a0a0c]">
          <div className="flex items-center justify-between mb-3 text-xs font-mono text-zinc-400">
            <div className="flex items-center space-x-2">
              <Activity className="w-3.5 h-3.5 text-zinc-300" />
              <span className="font-semibold text-zinc-200">HW-827 PPG Oscilloscope (Analog Pin A0)</span>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-zinc-500">Signal: <strong className="text-zinc-300 font-normal">{signalQuality}</strong></span>
              <span className="text-zinc-500">100Hz Sample Rate</span>
            </div>
          </div>

          <PpgWaveformCanvas
            waveBuffer={waveBuffer}
            bpm={bpm}
            beatCount={beatCount}
            signalQuality={signalQuality}
            isRunning={isRunning}
            height={220}
          />
        </div>

        {/* Section 3: Integrated Live Telemetry Bar */}
        <div className="px-6 py-4 bg-[#101014] border-t border-zinc-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-xs">
          
          <div className="flex items-center space-x-3">
            <Heart className={`w-4 h-4 ${bpm > 0 ? 'text-rose-500' : 'text-zinc-600'}`} />
            <div>
              <div className="text-[10px] text-zinc-500 uppercase">Heart Rate</div>
              <div className="text-sm font-bold text-white">{bpm > 0 ? `${bpm} BPM` : '--'}</div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Activity className="w-4 h-4 text-zinc-500" />
            <div>
              <div className="text-[10px] text-zinc-500 uppercase">Heartbeats</div>
              <div className="text-sm font-bold text-white">{beatCount} beats</div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <ShieldCheck className="w-4 h-4 text-zinc-500" />
            <div>
              <div className="text-[10px] text-zinc-500 uppercase">Match Score</div>
              <div className="text-sm font-bold text-white">
                {matchScore > 0 ? `${matchScore}%` : '--'}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="w-2 h-2 rounded-full bg-zinc-600" />
            <div>
              <div className="text-[10px] text-zinc-500 uppercase">16x2 LCD Output</div>
              <div className="text-xs font-semibold text-zinc-200 truncate max-w-[140px]">
                {lcdLine1}
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Advanced Diagnostics Toggle (Expandable on demand) */}
      <div className="space-y-4">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center space-x-2 text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors mx-auto"
        >
          <span>{showAdvanced ? 'Hide Technical Diagnostics' : 'Show Serial Monitor & Morphology Details'}</span>
          {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showAdvanced && (
          <div className="space-y-4 animate-in fade-in duration-300">
            {/* 20-Point Biometric Template Comparison */}
            <TemplateComparisonCard
              enrolledTemplate={enrolledTemplate}
              currentTemplate={currentTemplate}
              matchScore={matchScore}
              threshold={70}
            />

            {/* Developer Serial Monitor Console */}
            <SerialConsole
              serialLogs={serialLogs}
              isConnected={isHardwareConnected}
              onClear={onClearSerial}
              onSendCommand={onSendSerial}
            />
          </div>
        )}
      </div>

    </div>
  );
}
