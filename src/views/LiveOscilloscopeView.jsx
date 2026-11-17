import React from 'react';
import PpgWaveformCanvas from '../components/PpgWaveformCanvas';
import { Activity, Heart, Zap, Layers } from 'lucide-react';

export default function LiveOscilloscopeView({
  engineState = {},
  onStart = () => {},
  onStop = () => {}
}) {
  const {
    waveBuffer = [],
    bpm = 0,
    beatCount = 0,
    validIntervals = 0,
    signalQuality = 'READY',
    signalAmplitude = 0,
    isRunning = false
  } = engineState;

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      
      {/* Top Bar */}
      <div className="pro-card p-4 border border-zinc-800 bg-[#101014] flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-300">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">
              PPG Signal Oscilloscope
            </h2>
            <p className="text-xs font-mono text-zinc-500">
              100Hz real-time sampling â€¢ Moving baseline cancellation
            </p>
          </div>
        </div>
      </div>

      {/* Large Waveform Canvas */}
      <PpgWaveformCanvas
        waveBuffer={waveBuffer}
        bpm={bpm}
        beatCount={beatCount}
        signalQuality={signalQuality}
        isRunning={isRunning}
        height={280}
      />

      {/* Diagnostic Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        <div className="pro-card p-4 border border-zinc-800 bg-[#101014] space-y-3 font-mono text-xs">
          <div className="text-zinc-300 font-semibold flex items-center space-x-1.5">
            <Heart className="w-3.5 h-3.5 text-zinc-400" />
            <span>Hemodynamics</span>
          </div>
          <div className="space-y-2 text-zinc-400">
            <div className="flex justify-between border-b border-zinc-800/60 pb-1">
              <span>Heart Rate</span>
              <span className="text-white font-bold">{bpm > 0 ? `${bpm} BPM` : '--'}</span>
            </div>
            <div className="flex justify-between border-b border-zinc-800/60 pb-1">
              <span>Inter-Beat Interval (IBI)</span>
              <span className="text-zinc-200">{bpm > 0 ? `${Math.round(60000 / bpm)} ms` : '--'}</span>
            </div>
            <div className="flex justify-between">
              <span>Validated Intervals</span>
              <span className="text-zinc-200">{validIntervals}</span>
            </div>
          </div>
        </div>

        <div className="pro-card p-4 border border-zinc-800 bg-[#101014] space-y-3 font-mono text-xs">
          <div className="text-zinc-300 font-semibold flex items-center space-x-1.5">
            <Zap className="w-3.5 h-3.5 text-zinc-400" />
            <span>Signal DSP</span>
          </div>
          <div className="space-y-2 text-zinc-400">
            <div className="flex justify-between border-b border-zinc-800/60 pb-1">
              <span>Signal Amplitude</span>
              <span className="text-zinc-200">{signalAmplitude > 0 ? `${signalAmplitude} LSB` : '--'}</span>
            </div>
            <div className="flex justify-between border-b border-zinc-800/60 pb-1">
              <span>Baseline IIR Filter</span>
              <span className="text-zinc-200">0.98 * Base + 0.02 * Raw</span>
            </div>
            <div className="flex justify-between">
              <span>Sampling Window</span>
              <span className="text-zinc-200">10ms (100 Hz)</span>
            </div>
          </div>
        </div>

        <div className="pro-card p-4 border border-zinc-800 bg-[#101014] space-y-3 font-mono text-xs">
          <div className="text-zinc-300 font-semibold flex items-center space-x-1.5">
            <Layers className="w-3.5 h-3.5 text-zinc-400" />
            <span>Template Vector</span>
          </div>
          <div className="space-y-2 text-zinc-400">
            <div className="flex justify-between border-b border-zinc-800/60 pb-1">
              <span>Vector Dimension</span>
              <span className="text-zinc-200">20 Nodes</span>
            </div>
            <div className="flex justify-between border-b border-zinc-800/60 pb-1">
              <span>EEPROM Address</span>
              <span className="text-zinc-200">Offset 0x04</span>
            </div>
            <div className="flex justify-between">
              <span>Magic Checksum</span>
              <span className="text-zinc-200">0x5D6D (23917)</span>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
