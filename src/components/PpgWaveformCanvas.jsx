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

    // Draw Crisp Pure White / Silver PPG Waveform
    ctx.strokeStyle = '#f4f4f5';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();

    waveBuffer.forEach((pt, i) => {
      const x = i * stepX;
      const centerY = h / 2;
      const y = centerY - (pt.ac || 0) * (h / 320);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        const prevPt = waveBuffer[i - 1];
        const prevX = (i - 1) * stepX;
        const prevY = centerY - (prevPt.ac || 0) * (h / 320);
        const midX = (prevX + x) / 2;
        ctx.quadraticCurveTo(prevX, prevY, midX, (prevY + y) / 2);
      }
    });

    ctx.lineTo(width, h / 2 - (waveBuffer[waveBuffer.length - 1].ac || 0) * (h / 320));
    ctx.stroke();

    // Subtle Peak Markers
    waveBuffer.forEach((pt, i) => {
      if (pt.isPeak) {
        const x = i * stepX;
        const centerY = h / 2;
        const y = centerY - (pt.ac || 0) * (h / 320);

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
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

      {/* Minimal Voltage Scale */}
      <div className="absolute left-2 top-2 text-[9px] font-mono text-zinc-600 select-none">
        +3.3V
      </div>
      <div className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-mono text-zinc-600 select-none">
        0V Baseline
      </div>
    </div>
  );
}
