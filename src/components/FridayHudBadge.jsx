import React, { useState, useEffect } from 'react';
import { Bot, Volume2, ShieldAlert } from 'lucide-react';
import { fridayVoice } from '../audio/fridayVoice';

export default function FridayHudBadge() {
  const [hudState, setHudState] = useState({
    text: '',
    isSpeaking: false,
    urgency: 'normal'
  });

  useEffect(() => {
    fridayVoice.onSubtitleChange = (state) => {
      setHudState(state);
    };
    return () => {
      fridayVoice.onSubtitleChange = null;
    };
  }, []);

  if (!hudState.isSpeaking || !hudState.text) return null;

  const isAlert = hudState.urgency === 'alert';

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-md animate-in slide-in-from-bottom-3 fade-in duration-300">
      <div
        className={`rounded-2xl p-4 border backdrop-blur-md shadow-2xl flex items-start space-x-3.5 ${
          isAlert
            ? 'bg-rose-950/85 border-rose-700/80 text-rose-200 shadow-rose-950/50'
            : 'bg-[#0a0f1d]/90 border-cyan-500/60 text-cyan-100 shadow-cyan-950/60'
        }`}
      >
        {/* Holographic Arc Reactor / F.R.I.D.A.Y. Icon */}
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-all ${
            isAlert
              ? 'bg-rose-900/60 border-rose-500 text-rose-300 animate-pulse'
              : 'bg-cyan-950/80 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.5)]'
          }`}
        >
          {isAlert ? <ShieldAlert className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <span
                className={`text-[10px] font-mono uppercase tracking-widest font-extrabold px-1.5 py-0.2 rounded border ${
                  isAlert
                    ? 'bg-rose-900/80 text-rose-300 border-rose-700'
                    : 'bg-cyan-950 text-cyan-300 border-cyan-700'
                }`}
              >
                F.R.I.D.A.Y. • TACTICAL AI
              </span>
            </div>

            {/* Pulsing Audio Waveform Indicator */}
            <div className="flex items-center space-x-0.5">
              <span className={`w-1 h-3 rounded-full animate-bounce ${isAlert ? 'bg-rose-400' : 'bg-cyan-400'}`} style={{ animationDelay: '0ms' }} />
              <span className={`w-1 h-4 rounded-full animate-bounce ${isAlert ? 'bg-rose-400' : 'bg-cyan-400'}`} style={{ animationDelay: '150ms' }} />
              <span className={`w-1 h-2 rounded-full animate-bounce ${isAlert ? 'bg-rose-400' : 'bg-cyan-400'}`} style={{ animationDelay: '300ms' }} />
              <span className={`w-1 h-3.5 rounded-full animate-bounce ${isAlert ? 'bg-rose-400' : 'bg-cyan-400'}`} style={{ animationDelay: '100ms' }} />
            </div>
          </div>

          <p className="text-xs font-sans font-medium leading-relaxed select-text">
            "{hudState.text}"
          </p>
        </div>
      </div>
    </div>
  );
}
