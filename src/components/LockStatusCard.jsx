import React from 'react';
import { Lock, Unlock, Play, Square, Usb, ShieldCheck, AlertCircle } from 'lucide-react';

export default function LockStatusCard({
  state = 'DISCONNECTED', // 'DISCONNECTED' | 'IDLE' | 'CAPTURING' | 'VERIFYING_BEATS' | 'VERIFYING_BIOMETRIC' | 'ACCESS_GRANTED' | 'ACCESS_DENIED'
  statusMessage = 'System Ready - Locked',
  servoAngle = 0,
  ledStatus = false,
  buzzerActive = false,
  matchScore = 0,
  isRunning = false,
  onStart = () => {},
  onStop = () => {}
}) {
  const isUnlocked = servoAngle > 45 || state === 'ACCESS_GRANTED';
  const isDenied = state === 'ACCESS_DENIED';
  const isDisconnected = state === 'DISCONNECTED';

  return (
    <div className="pro-card p-5 border border-zinc-800 bg-[#101014]">
      <div className="flex flex-col md:flex-row items-center justify-between gap-5">
        
        {/* Left Lock Visualizer */}
        <div className="flex items-center space-x-4">
          <div className={`w-14 h-14 rounded-lg flex items-center justify-center border transition-colors ${
            isUnlocked 
              ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-400' 
              : isDenied 
              ? 'bg-rose-950/40 border-rose-800/80 text-rose-400'
              : isDisconnected
              ? 'bg-zinc-900 border-zinc-800 text-zinc-500'
              : 'bg-zinc-900 border-zinc-700 text-zinc-200'
          }`}>
            {isUnlocked ? (
              <Unlock className="w-6 h-6 text-emerald-400" />
            ) : isDenied ? (
              <AlertCircle className="w-6 h-6 text-rose-400" />
            ) : isDisconnected ? (
              <Usb className="w-6 h-6 text-zinc-500" />
            ) : (
              <Lock className="w-6 h-6 text-zinc-200" />
            )}
          </div>

          <div>
            <div className="flex items-center space-x-2">
              <span className={`text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded border ${
                isUnlocked ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300' :
                isDenied ? 'bg-rose-950/60 border-rose-800 text-rose-300' :
                isDisconnected ? 'bg-zinc-900 border-zinc-800 text-zinc-400' :
                'bg-zinc-900 border-zinc-700 text-zinc-300'
              }`}>
                {isUnlocked ? 'UNLOCKED (90Â°)' : 
                 isDenied ? 'ACCESS DENIED' : 
                 isDisconnected ? 'ARDUINO OFFLINE' : 
                 state === 'CAPTURING' ? 'RECORDING SENSOR' : 'LOCKED (0Â°)'}
              </span>

              <span className="text-[11px] font-mono text-zinc-500">
                Servo: {servoAngle}Â°
              </span>
            </div>

            <h2 className="text-xl font-bold font-sans tracking-tight text-white mt-1">
              {isUnlocked ? 'Access Granted' : 
               isDenied ? 'Authentication Failed' : 
               isDisconnected ? 'Connect Hardware' : 
               state === 'CAPTURING' ? 'Measuring PPG Signal' : 'Smart Credential Lock'}
            </h2>

            <p className="text-xs text-zinc-400 font-mono mt-0.5">
              {statusMessage}
            </p>
          </div>
        </div>

        {/* Primary Action Button */}
        <div className="flex items-center space-x-3">
          {isDisconnected ? (
            <button
              onClick={onStart}
              className="px-5 py-2.5 rounded-md font-sans font-semibold text-xs text-black bg-white hover:bg-zinc-200 active:scale-95 transition-all flex items-center space-x-2 cursor-pointer shadow-subtle"
            >
              <Usb className="w-3.5 h-3.5 text-black" />
              <span>Connect Arduino USB</span>
            </button>
          ) : !isRunning ? (
            <button
              onClick={onStart}
              className="px-5 py-2.5 rounded-md font-sans font-semibold text-xs text-black bg-white hover:bg-zinc-200 active:scale-95 transition-all flex items-center space-x-2 cursor-pointer shadow-subtle"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start PPG Scan</span>
            </button>
          ) : (
            <button
              onClick={onStop}
              className="px-4 py-2.5 rounded-md font-sans font-medium text-xs text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-all flex items-center space-x-1.5"
            >
              <Square className="w-3.5 h-3.5 fill-current text-zinc-400" />
              <span>Reset State</span>
            </button>
          )}
        </div>

      </div>

      {/* Real-time Hardware Pin Indicators bar */}
      <div className="mt-4 pt-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono text-zinc-400">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1.5">
            <span className="text-zinc-500">LED:</span>
            <span className={`w-2 h-2 rounded-full ${ledStatus ? 'bg-emerald-400' : 'bg-zinc-700'}`} />
          </div>

          <div className="flex items-center space-x-1.5">
            <span className="text-zinc-500">Buzzer:</span>
            <span className={`w-2 h-2 rounded-full ${buzzerActive ? 'bg-amber-400' : 'bg-zinc-700'}`} />
          </div>

          <div className="flex items-center space-x-1.5">
            <span className="text-zinc-500">Servo:</span>
            <span className="text-zinc-300">{servoAngle}Â° ({isUnlocked ? 'Unlocked' : 'Locked'})</span>
          </div>

          <div className="flex items-center space-x-1.5">
            <span className="text-zinc-500">PPG:</span>
            <span className="text-zinc-300">Pulse Sensor (A0)</span>
          </div>
        </div>

        {matchScore > 0 && (
          <div className="flex items-center space-x-1.5 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
            <span className="text-zinc-500">Match Score:</span>
            <span className={`font-semibold ${matchScore >= 70 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {matchScore}% (Threshold: 70%)
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
