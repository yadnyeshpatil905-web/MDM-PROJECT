import React from 'react';
import { Monitor } from 'lucide-react';

export default function LCDDisplay({ line1 = '', line2 = '' }) {
  const format16 = (str) => {
    const s = String(str || '').toUpperCase();
    return s.padEnd(16, ' ').slice(0, 16);
  };

  const l1 = format16(line1);
  const l2 = format16(line2);

  return (
    <div className="pro-card p-3.5 border border-zinc-800 bg-[#101014]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-1.5 text-xs font-mono text-zinc-400">
          <Monitor className="w-3.5 h-3.5 text-zinc-500" />
          <span className="font-semibold text-zinc-300">16x2 I2C Display (0x27)</span>
        </div>
        <span className="text-[10px] font-mono text-zinc-600">Mirror</span>
      </div>

      <div className="lcd-monochrome p-3 rounded font-mono text-xs leading-relaxed">
        <div className="h-5 flex items-center font-bold tracking-widest text-zinc-100">
          {l1}
        </div>
        <div className="h-5 flex items-center font-bold tracking-widest text-zinc-400">
          {l2}
        </div>
      </div>
    </div>
  );
}
