'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { WhiteboardAPI, Point } from '@/hooks/useWhiteboard';

interface WhiteboardCanvasProps {
  whiteboard: WhiteboardAPI;
  active: boolean;
}

// Logical coordinate space matching slide design
const SOURCE_W = 1280;
const SOURCE_H = 720;

interface LaserPoint {
  x: number;
  y: number;
  time: number;
}

const LASER_LIFETIME_MS = 700;

export default function WhiteboardCanvas({ whiteboard, active }: WhiteboardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [textInput, setTextInput] = useState<{ x: number; y: number; value: string } | null>(null);
  const isDrawing = useRef(false);
  const rafRef = useRef<number>(0);
  const laserTrailRef = useRef<LaserPoint[]>([]);
  const laserRafRef = useRef<number>(0);

  // Convert pointer event to logical coordinates
  const getPoint = useCallback((e: React.PointerEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0, pressure: 0.5 };

    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * SOURCE_W;
    const y = ((e.clientY - rect.top) / rect.height) * SOURCE_H;
    return { x, y, pressure: e.pressure || 0.5 };
  }, []);

  // Draw the laser trail on top of the existing canvas contents
  const drawLaserTrail = useCallback((ctx: CanvasRenderingContext2D) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const now = performance.now();
    const trail = laserTrailRef.current.filter((p) => now - p.time < LASER_LIFETIME_MS);
    laserTrailRef.current = trail;
    if (trail.length === 0) return;

    const scaleX = canvas.width / SOURCE_W;
    const scaleY = canvas.height / SOURCE_H;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Fading glow line between points
    for (let i = 1; i < trail.length; i++) {
      const prev = trail[i - 1];
      const curr = trail[i];
      const age = (now - curr.time) / LASER_LIFETIME_MS; // 0..1
      const alpha = 1 - age;

      ctx.strokeStyle = `rgba(255, 60, 60, ${alpha * 0.35})`;
      ctx.lineWidth = 16 * Math.min(scaleX, scaleY);
      ctx.beginPath();
      ctx.moveTo(prev.x * scaleX, prev.y * scaleY);
      ctx.lineTo(curr.x * scaleX, curr.y * scaleY);
      ctx.stroke();

      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
      ctx.lineWidth = 4 * Math.min(scaleX, scaleY);
      ctx.beginPath();
      ctx.moveTo(prev.x * scaleX, prev.y * scaleY);
      ctx.lineTo(curr.x * scaleX, curr.y * scaleY);
      ctx.stroke();
    }

    // Bright head at the most recent point
    const head = trail[trail.length - 1];
    const hx = head.x * scaleX;
    const hy = head.y * scaleY;
    const radius = 10 * Math.min(scaleX, scaleY);
    const glow = ctx.createRadialGradient(hx, hy, 0, hx, hy, radius * 2.5);
    glow.addColorStop(0, 'rgba(255, 80, 80, 0.9)');
    glow.addColorStop(0.4, 'rgba(255, 40, 40, 0.5)');
    glow.addColorStop(1, 'rgba(255, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(hx, hy, radius * 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.beginPath();
    ctx.arc(hx, hy, radius * 0.45, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }, []);

  // Redraw canvas
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    whiteboard.renderToCanvas(ctx, canvas.width, canvas.height, SOURCE_W, SOURCE_H);
    drawLaserTrail(ctx);
  }, [whiteboard, drawLaserTrail]);

  // Animation loop for the laser trail — runs only while trail is non-empty
  const startLaserLoop = useCallback(() => {
    if (laserRafRef.current) return;
    const tick = () => {
      redraw();
      if (laserTrailRef.current.length > 0) {
        laserRafRef.current = requestAnimationFrame(tick);
      } else {
        laserRafRef.current = 0;
      }
    };
    laserRafRef.current = requestAnimationFrame(tick);
  }, [redraw]);

  // Resize canvas buffer to match display size
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = wrapper.clientWidth;
      const h = wrapper.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        redraw();
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [redraw]);

  // Redraw when strokes change
  useEffect(() => {
    redraw();
  }, [whiteboard.strokes, redraw]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!active) return;
    e.preventDefault();
    e.stopPropagation();

    const point = getPoint(e);
    const tool = whiteboard.settings.tool;

    if (tool === 'text') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const displayX = e.clientX - rect.left;
      const displayY = e.clientY - rect.top;
      setTextInput({ x: displayX, y: displayY, value: '' });
      return;
    }

    if (tool === 'sticker') {
      whiteboard.addSticker(point);
      redraw();
      return;
    }

    if (tool === 'laser') {
      isDrawing.current = true;
      (e.target as Element).setPointerCapture(e.pointerId);
      laserTrailRef.current.push({ x: point.x, y: point.y, time: performance.now() });
      startLaserLoop();
      return;
    }

    isDrawing.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);
    whiteboard.startStroke(point);
  }, [active, getPoint, whiteboard, redraw, startLaserLoop]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDrawing.current) return;
    e.preventDefault();
    const point = getPoint(e);

    if (whiteboard.settings.tool === 'laser') {
      laserTrailRef.current.push({ x: point.x, y: point.y, time: performance.now() });
      startLaserLoop();
      return;
    }

    whiteboard.continueStroke(point);

    // Throttle redraws via rAF for smooth preview
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        redraw();
        rafRef.current = 0;
      });
    }
  }, [getPoint, whiteboard, redraw, startLaserLoop]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDrawing.current) return;
    e.preventDefault();
    isDrawing.current = false;

    if (whiteboard.settings.tool === 'laser') {
      // Trail fades on its own via the rAF loop — nothing to commit
      return;
    }

    whiteboard.endStroke();
    redraw();
  }, [whiteboard, redraw]);

  const handleTextSubmit = useCallback(() => {
    if (!textInput || !textInput.value.trim()) {
      setTextInput(null);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      setTextInput(null);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const logicalX = (textInput.x / rect.width) * SOURCE_W;
    const logicalY = (textInput.y / rect.height) * SOURCE_H;

    whiteboard.addText({ x: logicalX, y: logicalY, pressure: 0.5 }, textInput.value);
    setTextInput(null);
  }, [textInput, whiteboard]);

  // Clean up the laser animation loop on unmount
  useEffect(() => {
    return () => {
      if (laserRafRef.current) {
        cancelAnimationFrame(laserRafRef.current);
        laserRafRef.current = 0;
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, []);

  const getCursor = () => {
    if (!active) return 'default';
    switch (whiteboard.settings.tool) {
      case 'pen':
      case 'highlighter':
      case 'arrow':
        return 'crosshair';
      case 'laser': return 'none';
      case 'eraser': return 'pointer';
      case 'text': return 'text';
      case 'sticker': return 'pointer';
      default: return 'crosshair';
    }
  };

  return (
    <div
      ref={wrapperRef}
      className="absolute inset-0 z-20 rounded-2xl overflow-hidden"
      style={{
        pointerEvents: active ? 'auto' : 'none',
        cursor: getCursor(),
        touchAction: 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />

      {/* Inline text input */}
      {textInput && (
        <input
          autoFocus
          type="text"
          value={textInput.value}
          onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleTextSubmit();
            if (e.key === 'Escape') setTextInput(null);
          }}
          onBlur={handleTextSubmit}
          className="absolute bg-white/80 backdrop-blur-sm border-b-2 border-current outline-none font-bold px-1 rounded"
          style={{
            left: textInput.x,
            top: textInput.y,
            color: whiteboard.settings.color,
            fontSize: `${Math.max(14, whiteboard.settings.fontSize * 0.5)}px`,
            minWidth: '80px',
          }}
        />
      )}
    </div>
  );
}
