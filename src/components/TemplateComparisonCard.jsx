import React from 'react';
import { Fingerprint } from 'lucide-react';

export default function TemplateComparisonCard({
  enrolledTemplate = [],
  currentTemplate = [],
  matchScore = 0,
  threshold = 70
}) {
  return (
    <div className="pro-card p-5 border border-zinc-800 bg-[#101014]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Fingerprint className="w-4 h-4 text-zinc-400" />
          <div>
            <h3 className="font-semibold text-xs text-white">
              20-Point Biometric Morphology Template
            </h3>
            <p className="text-[11px] font-mono text-zinc-500">
              Normalized arterial waveform cross-correlation
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 text-xs font-mono">
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-0.5 bg-zinc-300 inline-block" />
            <span className="text-zinc-400">Enrolled</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-0.5 bg-zinc-500 inline-block" />
            <span className="text-zinc-500">Captured</span>
          </div>
        </div>
      </div>

      {/* SVG Multi-point Waveform Overlay */}
      <div className="relative h-36 w-full bg-[#0a0a0c] rounded-md p-2 border border-zinc-800/80 overflow-hidden">
        <svg className="w-full h-full overflow-visible" viewBox="0 0 400 120" preserveAspectRatio="none">
          {/* Subtle Grid lines */}
          <line x1="0" y1="30" x2="400" y2="30" stroke="#1c1c22" strokeDasharray="2,2" />
          <line x1="0" y1="60" x2="400" y2="60" stroke="#1c1c22" strokeDasharray="2,2" />
          <line x1="0" y1="90" x2="400" y2="90" stroke="#1c1c22" strokeDasharray="2,2" />

          {/* Enrolled Template Path (Solid White) */}
          {enrolledTemplate.length > 0 && (
            <polyline
              fill="none"
              stroke="#ffffff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={enrolledTemplate.map((val, i) => {
                const x = (i / (enrolledTemplate.length - 1)) * 400;
                const y = 115 - (val / 255) * 105;
                return `${x},${y}`;
              }).join(' ')}
            />
          )}

          {/* Current Captured Template Path */}
          {currentTemplate.length > 0 && (
            <polyline
              fill="none"
              stroke={matchScore >= threshold ? '#34d399' : '#a1a1aa'}
              strokeWidth="1.5"
              strokeDasharray="4,3"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={currentTemplate.map((val, i) => {
                const x = (i / (currentTemplate.length - 1)) * 400;
                const y = 115 - (val / 255) * 105;
                return `${x},${y}`;
              }).join(' ')}
            />
          )}

          {/* Data point dots */}
          {enrolledTemplate.map((val, i) => {
            const x = (i / (enrolledTemplate.length - 1)) * 400;
            const y = 115 - (val / 255) * 105;
            return <circle key={`enr-${i}`} cx={x} cy={y} r="2" fill="#ffffff" />;
          })}
        </svg>
      </div>

      {/* Discrete 20-Point Vector Values */}
      <div className="mt-3 grid grid-cols-10 md:grid-cols-20 gap-1 text-center font-mono text-[9px]">
        {Array.from({ length: 20 }).map((_, idx) => {
          const enr = enrolledTemplate[idx] || 0;
          const cur = currentTemplate[idx] || 0;
          return (
            <div 
              key={idx} 
              className="p-1 rounded bg-[#0a0a0c] border border-zinc-800 text-zinc-400"
            >
              <div className="text-[8px] text-zinc-600">P{idx+1}</div>
              <div className="text-zinc-200">{enr}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
