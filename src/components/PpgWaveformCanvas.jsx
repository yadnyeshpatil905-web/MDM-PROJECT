import React, { useEffect, useRef } from 'react';

export default function PpgWaveformCanvas({ 
  waveBuffer = [], 
  bpm = 0, 
  beatCount = 0, 
  signalQuality = 'READY', 
  isRunning = false,
  height = 200 
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Scale for Retina / High DPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const h = rect.height;

    // Dark solid canvas background
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, width, h);

    // Subtle Grid lines (fine dark grid)
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#16161a';

    const gridSpacingX = 40;
    const gridSpacingY = 30;

    for (let x = 0; x < width; x += gridSpacingX) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    for (let y = 0; y < h; y += gridSpacingY) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Center baseline
    ctx.strokeStyle = '#1e1e24';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(width, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    if (!waveBuffer || waveBuffer.length < 2) {
      // Flat idle line
      ctx.strokeStyle = '#27272a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(width, h / 2);
      ctx.stroke();
      return;
    }

    const pointsCount = waveBuffer.length;
    const stepX = width / (pointsCount - 1);

    // Dynamic amplitude scaling for HW-827 Pulse Sensor 10-bit analog readings
    let maxAc = 0;
    waveBuffer.forEach(pt => {
      const a = Math.abs(pt.ac !== undefined ? pt.ac : ((pt.val || 512) - 512));
      if (a > maxAc) maxAc = a;
    });
    // Scale so 15-60 LSB pulse sensor variations fill 80% of canvas height comfortably
    const dynamicRange = Math.max(25, maxAc * 1.2);
    const scaleY = (h * 0.4) / dynamicRange;

    // Draw Crisp Pure White / Silver PPG Waveform
    ctx.strokeStyle = '#f4f4f5';
    ctx.lineWidth = 2.0;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();

    waveBuffer.forEach((pt, i) => {
      const x = i * stepX;
      const centerY = h / 2;
      const acVal = pt.ac !== undefined ? pt.ac : ((pt.val || 512) - 512);
      const y = Math.max(8, Math.min(h - 8, centerY - acVal * scaleY));
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        const prevPt = waveBuffer[i - 1];
        const prevAc = prevPt.ac !== undefined ? prevPt.ac : ((prevPt.val || 512) - 512);
        const prevX = (i - 1) * stepX;
        const prevY = Math.max(8, Math.min(h - 8, centerY - prevAc * scaleY));
        const midX = (prevX + x) / 2;
        ctx.quadraticCurveTo(prevX, prevY, midX, (prevY + y) / 2);
      }
    });

    const lastAc = waveBuffer[waveBuffer.length - 1].ac !== undefined
      ? waveBuffer[waveBuffer.length - 1].ac
      : ((waveBuffer[waveBuffer.length - 1].val || 512) - 512);
    ctx.lineTo(width, Math.max(8, Math.min(h - 8, h / 2 - lastAc * scaleY)));
    ctx.stroke();

    // Subtle Peak Markers
    waveBuffer.forEach((pt, i) => {
      if (pt.isPeak) {
        const x = i * stepX;
        const centerY = h / 2;
        const acVal = pt.ac !== undefined ? pt.ac : ((pt.val || 512) - 512);
        const y = Math.max(8, Math.min(h - 8, centerY - acVal * scaleY));

        ctx.fillStyle = '#22d3ee';
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });

  }, [waveBuffer, isRunning, signalQuality, height]);

  return (
    <div className="relative w-full overflow-hidden rounded-md border border-zinc-800/80" style={{ height: `${height}px` }}>
      <canvas 
        ref={canvasRef} 
        className="w-full h-full block"
      />

      {/* Minimal Voltage Scale & Status Overlay */}
      <div className="absolute left-2.5 top-2 text-[9px] font-mono text-zinc-500 select-none flex items-center space-x-2">
        <span>HW-827 Pulse Sensor • 10-Bit ADC (0–1023)</span>
      </div>
      <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[9px] font-mono text-zinc-600 select-none">
        0V Baseline (512 LSB)
      </div>
      <div className="absolute right-2.5 top-2 select-none">
        <span className={`text-[9px] font-mono font-semibold px-2 py-0.5 rounded border ${
          isRunning 
            ? 'bg-cyan-950/70 text-cyan-300 border-cyan-800 animate-pulse'
            : 'bg-zinc-900/80 text-zinc-400 border-zinc-800'
        }`}>
          {isRunning ? 'STREAMING REAL-TIME PPG' : 'STANDBY • READY TO ACQUIRE'}
        </span>
      </div>
    </div>
  );
}
