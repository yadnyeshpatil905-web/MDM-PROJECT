import React from 'react';
import { 
  Lock, 
  Unlock, 
  Fingerprint, 
  Heart, 
  Activity, 
  ShieldCheck, 
  AlertCircle, 
  Play, 
  Square,
  CheckCircle2
} from 'lucide-react';
import PpgWaveformCanvas from '../components/PpgWaveformCanvas';
import TemplateComparisonCard from '../components/TemplateComparisonCard';

export default function AuthenticationView({
  engineState = {},
  isHardwareConnected = false,
  onConnectHardware = () => {},
  onStart = () => {},
  onStop = () => {}
}) {
  const {
    state = 'DISCONNECTED',
    statusMessage = 'System Ready - Locked',
    servoAngle = 0,
    bpm = 0,
    beatCount = 0,
    validIntervals = 0,
    signalQuality = 'READY',
    isRunning = false,
    waveBuffer = [],
    enrolledTemplate = [],
    currentTemplate = [],
    matchScore = 0
  } = engineState;

  const isGranted = state === 'ACCESS_GRANTED';
  const isDenied = state === 'ACCESS_DENIED';

  const stages = [
    { id: 'IDLE', label: '1. Finger Detection', desc: 'Waiting for sensor' },
    { id: 'CAPTURING', label: '2. Pulse Acquisition', desc: 'Sampling pin A0' },
    { id: 'VERIFYING_BEATS', label: '3. Rhythm Check', desc: 'IBI 400-1333ms' },
    { id: 'VERIFYING_BIOMETRIC', label: '4. Biometric Match', desc: '20-point morphology' },
    { id: isGranted ? 'ACCESS_GRANTED' : isDenied ? 'ACCESS_DENIED' : 'RESULT', 
      label: isGranted ? '5. Granted' : isDenied ? '5. Denied' : '5. Decision', 
      desc: isGranted ? 'Servo unlocked 90°' : isDenied ? 'Servo locked 0°' : 'Evaluating threshold' }
  ];

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      
      {/* State Progress Bar */}
      <div className="pro-card p-3.5 border border-zinc-800 bg-[#101014]">
        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-2.5">
          Biometric Verification Pipeline
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {stages.map((st, idx) => {
            const isCurrent = state === st.id;
            const isPast = isGranted && idx < 4;
            return (
              <div 
                key={st.id}
                className={`p-2.5 rounded border text-left transition-colors ${
                  isCurrent 
                    ? 'bg-zinc-800 border-zinc-600 text-zinc-100' 
                    : isPast
                    ? 'bg-[#0d0d10] border-zinc-800 text-zinc-300'
                    : 'bg-[#0a0a0c] border-zinc-900 text-zinc-600'
                }`}
              >
                <div className="flex items-center space-x-1.5 text-xs font-semibold">
                  {isPast ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  ) : isCurrent ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
                  )}
                  <span className="truncate">{st.label}</span>
                </div>
                <div className="text-[10px] font-mono text-zinc-500 mt-0.5 truncate">
                  {st.desc}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Panel */}
      <div className="pro-card p-6 border border-zinc-800 bg-[#101014] text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center">
          {isGranted ? (
            <Unlock className="w-8 h-8 text-emerald-400" />
          ) : isDenied ? (
            <AlertCircle className="w-8 h-8 text-rose-400" />
          ) : (
            <Fingerprint className="w-8 h-8 text-zinc-300" />
          )}
        </div>

        <div>
          <div className="inline-block text-[10px] font-mono text-zinc-400 uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 mb-1.5">
            {isGranted ? 'Identity Verified' : isDenied ? 'Access Denied' : 'Optical PPG Biometric'}
          </div>
          <h2 className="text-xl font-bold font-sans text-white">
            {isGranted ? 'Access Granted (Servo 90°)' : isDenied ? 'Authentication Failed' : 'Place Finger on HW-827 Sensor'}
          </h2>
          <p className="text-xs font-mono text-zinc-400 max-w-md mx-auto mt-1">
            {statusMessage}
          </p>
        </div>

        {!isHardwareConnected ? (
          <button
            onClick={onConnectHardware}
            className="px-5 py-2.5 rounded-md font-sans font-semibold text-xs text-black bg-white hover:bg-zinc-200 transition-colors inline-flex items-center space-x-2"
          >
            <span>Connect Arduino UNO</span>
          </button>
        ) : (
          <button
            onClick={isRunning ? onStop : onStart}
            className="px-5 py-2.5 rounded-md font-sans font-semibold text-xs text-black bg-white hover:bg-zinc-200 transition-colors inline-flex items-center space-x-2"
          >
            {isRunning ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            <span>{isRunning ? 'Cancel Scan' : 'Start PPG Scan'}</span>
          </button>
        )}
      </div>

      {/* Waveform Canvas */}
      <PpgWaveformCanvas
        waveBuffer={waveBuffer}
        bpm={bpm}
        beatCount={beatCount}
        signalQuality={signalQuality}
        isRunning={isRunning}
        height={180}
      />

      {/* Template Comparison */}
      <TemplateComparisonCard
        enrolledTemplate={enrolledTemplate}
        currentTemplate={currentTemplate}
        matchScore={matchScore}
        threshold={70}
      />

    </div>
  );
}
