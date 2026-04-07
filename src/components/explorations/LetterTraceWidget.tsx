'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExplorationWidgetProps, LetterTraceConfig } from '@/lib/explorations/types';

const VIEWBOX = 200;
const CANVAS_SIZE = 300;

interface DrawnPoint {
  x: number;
  y: number;
}

function computeAccuracy(
  drawn: DrawnPoint[],
  guidePaths: Array<{ points: Array<{ x: number; y: number }> }>
): number {
  if (drawn.length === 0) return Infinity;
  const guidePoints = guidePaths.flatMap((p) => p.points);
  if (guidePoints.length === 0) return 0;

  let totalDist = 0;
  for (const dp of drawn) {
    let minDist = Infinity;
    for (const gp of guidePoints) {
      const d = Math.sqrt((dp.x - gp.x) ** 2 + (dp.y - gp.y) ** 2);
      if (d < minDist) minDist = d;
    }
    totalDist += minDist;
  }
  return totalDist / drawn.length;
}

function computeCoverage(
  drawn: DrawnPoint[],
  guidePaths: Array<{ points: Array<{ x: number; y: number }> }>,
  tolerance: number
): number {
  const mainPaths = guidePaths.filter((p) => p.points.length > 1);
  const guidePoints = mainPaths.flatMap((p) => p.points);
  if (guidePoints.length === 0 || drawn.length === 0) return 0;

  let covered = 0;
  for (const gp of guidePoints) {
    const close = drawn.some(
      (dp) => Math.sqrt((dp.x - gp.x) ** 2 + (dp.y - gp.y) ** 2) <= tolerance * 2
    );
    if (close) covered++;
  }
  return covered / guidePoints.length;
}

function renderTextMask(
  text: string,
  script: 'ar' | 'en',
  canvasSize: number
): boolean[] {
  const offscreen = document.createElement('canvas');
  offscreen.width = canvasSize;
  offscreen.height = canvasSize;
  const ctx = offscreen.getContext('2d')!;

  const fontFamily = script === 'ar' ? '"Cairo", sans-serif' : 'sans-serif';

  let fontSize = Math.floor(canvasSize * 0.7);
  ctx.font = `bold ${fontSize}px ${fontFamily}`;
  let metrics = ctx.measureText(text);
  while (metrics.width > canvasSize * 0.85 && fontSize > 20) {
    fontSize -= 4;
    ctx.font = `bold ${fontSize}px ${fontFamily}`;
    metrics = ctx.measureText(text);
  }

  const x = (canvasSize - metrics.width) / 2;
  const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.8;
  const descent = metrics.actualBoundingBoxDescent || fontSize * 0.2;
  const textHeight = ascent + descent;
  const y = (canvasSize + textHeight) / 2 - descent;

  ctx.fillStyle = '#000';
  ctx.fillText(text, x, y);

  const imageData = ctx.getImageData(0, 0, canvasSize, canvasSize);
  const mask: boolean[] = new Array(canvasSize * canvasSize);
  for (let i = 0; i < mask.length; i++) {
    mask[i] = imageData.data[i * 4 + 3] > 50;
  }
  return mask;
}

function computeTextCoverage(
  drawn: DrawnPoint[],
  textMask: boolean[],
  canvasSize: number,
  strokeRadius: number
): number {
  let totalTextPixels = 0;
  for (let i = 0; i < textMask.length; i++) {
    if (textMask[i]) totalTextPixels++;
  }
  if (totalTextPixels === 0) return 0;

  const covered = new Uint8Array(canvasSize * canvasSize);
  const scale = canvasSize / VIEWBOX;

  for (const pt of drawn) {
    const cx = Math.round(pt.x * scale);
    const cy = Math.round(pt.y * scale);
    const r = Math.round(strokeRadius * scale);

    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const px = cx + dx;
        const py = cy + dy;
        if (px >= 0 && px < canvasSize && py >= 0 && py < canvasSize) {
          covered[py * canvasSize + px] = 1;
        }
      }
    }
  }

  let coveredCount = 0;
  for (let i = 0; i < textMask.length; i++) {
    if (textMask[i] && covered[i]) coveredCount++;
  }

  return coveredCount / totalTextPixels;
}

export default function LetterTraceWidget({
  config,
  language,
  onComplete,
}: ExplorationWidgetProps<LetterTraceConfig>) {
  const displayText = config.text || config.letter || '';
  const { script, tolerance } = config;
  const hasVectorPaths = config.stroke_paths && config.stroke_paths.length > 0;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [drawnPoints, setDrawnPoints] = useState<DrawnPoint[]>([]);
  const [completed, setCompleted] = useState(false);
  const [feedback, setFeedback] = useState<'good' | 'try_again' | null>(null);
  const [starRating, setStarRating] = useState(0);
  const completedRef = useRef(false);
  const textMaskRef = useRef<boolean[] | null>(null);

  const scale = CANVAS_SIZE / VIEWBOX;

  // Progress indicator based on coverage
  const [coverageProgress, setCoverageProgress] = useState(0);

  useEffect(() => {
    if (!hasVectorPaths && displayText) {
      textMaskRef.current = renderTextMask(displayText, script, CANVAS_SIZE);
    }
  }, [displayText, script, hasVectorPaths]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = CANVAS_SIZE * dpr;
    canvas.height = CANVAS_SIZE * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    if (hasVectorPaths && config.stroke_paths) {
      for (const path of config.stroke_paths) {
        if (path.points.length === 1) {
          const p = path.points[0];
          ctx.beginPath();
          ctx.arc(p.x * scale, p.y * scale, 6 * scale / VIEWBOX * 100, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(156, 163, 175, 0.4)';
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(156, 163, 175, 0.3)';
          ctx.lineWidth = 16; // Thicker trace guide
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          const pts = path.points;
          ctx.moveTo(pts[0].x * scale, pts[0].y * scale);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x * scale, pts[i].y * scale);
          }
          ctx.stroke();

          // Start dot (animated guide dot placeholder)
          if (pts.length >= 2 && drawnPoints.length === 0) {
            const ax = pts[0].x * scale;
            const ay = pts[0].y * scale;
            ctx.beginPath();
            ctx.arc(ax, ay, 7, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(59, 130, 246, 0.6)';
            ctx.fill();
            // Outer ring
            ctx.beginPath();
            ctx.arc(ax, ay, 12, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(59, 130, 246, 0.3)';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
      }
    } else if (displayText) {
      const fontFamily = script === 'ar' ? '"Cairo", sans-serif' : 'sans-serif';
      let fontSize = Math.floor(CANVAS_SIZE * 0.7);
      ctx.font = `bold ${fontSize}px ${fontFamily}`;
      let metrics = ctx.measureText(displayText);
      while (metrics.width > CANVAS_SIZE * 0.85 && fontSize > 20) {
        fontSize -= 4;
        ctx.font = `bold ${fontSize}px ${fontFamily}`;
        metrics = ctx.measureText(displayText);
      }

      const x = (CANVAS_SIZE - metrics.width) / 2;
      const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.8;
      const descent = metrics.actualBoundingBoxDescent || fontSize * 0.2;
      const textHeight = ascent + descent;
      const y = (CANVAS_SIZE + textHeight) / 2 - descent;

      ctx.fillStyle = 'rgba(156, 163, 175, 0.2)';
      ctx.fillText(displayText, x, y);

      ctx.strokeStyle = 'rgba(156, 163, 175, 0.15)';
      ctx.lineWidth = 1;
      ctx.strokeText(displayText, x, y);
    }

    // Draw student strokes — thicker line
    if (drawnPoints.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = completed
        ? '#10b981'
        : feedback === 'try_again'
          ? '#ef4444'
          : '#3b82f6';
      ctx.lineWidth = 12; // Thicker trace
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(drawnPoints[0].x * scale, drawnPoints[0].y * scale);
      for (let i = 1; i < drawnPoints.length; i++) {
        ctx.lineTo(drawnPoints[i].x * scale, drawnPoints[i].y * scale);
      }
      ctx.stroke();
    }
  }, [config.stroke_paths, hasVectorPaths, displayText, script, drawnPoints, scale, completed, feedback]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const getCanvasPoint = useCallback(
    (clientX: number, clientY: number): DrawnPoint => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * VIEWBOX,
        y: ((clientY - rect.top) / rect.height) * VIEWBOX,
      };
    },
    []
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (completed) return;
      setDrawing(true);
      setFeedback(null);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      const pt = getCanvasPoint(e.clientX, e.clientY);
      setDrawnPoints([pt]);
    },
    [completed, getCanvasPoint]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drawing || completed) return;
      const pt = getCanvasPoint(e.clientX, e.clientY);
      setDrawnPoints((prev) => [...prev, pt]);
    },
    [drawing, completed, getCanvasPoint]
  );

  const handlePointerUp = useCallback(() => {
    if (!drawing || completedRef.current) return;
    setDrawing(false);

    // Tracing is practice — always accept the attempt, just vary the star rating
    if (hasVectorPaths && config.stroke_paths) {
      const coverage = computeCoverage(drawnPoints, config.stroke_paths, tolerance);
      setCoverageProgress(coverage);

      if (drawnPoints.length > 5) {
        completedRef.current = true;
        setCompleted(true);
        setFeedback('good');
        setStarRating(coverage >= 0.85 ? 3 : coverage >= 0.6 ? 2 : 1);
        setTimeout(() => onComplete(), 500);
      }
    } else if (textMaskRef.current) {
      const coverage = computeTextCoverage(drawnPoints, textMaskRef.current, CANVAS_SIZE, 5);
      setCoverageProgress(coverage);

      if (drawnPoints.length > 5) {
        completedRef.current = true;
        setCompleted(true);
        setFeedback('good');
        setStarRating(coverage >= 0.7 ? 3 : coverage >= 0.4 ? 2 : 1);
        setTimeout(() => onComplete(), 500);
      }
    }
  }, [drawing, drawnPoints, config.stroke_paths, hasVectorPaths, tolerance, onComplete]);

  const handleReset = useCallback(() => {
    setDrawnPoints([]);
    setFeedback(null);
    setCoverageProgress(0);
  }, []);

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-sm mx-auto px-4 rounded-2xl bg-gradient-to-b from-indigo-50/60 to-white py-6">
      {/* Text display */}
      <div className="text-center">
        <span
          className={`text-5xl font-bold text-slate-300 ${
            script === 'ar' ? 'font-cairo' : ''
          }`}
        >
          {displayText}
        </span>
      </div>

      {/* Progress fill bar */}
      {!completed && drawnPoints.length > 0 && (
        <div className="w-full max-w-[300px]">
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-400 transition-all duration-300"
              style={{ width: `${Math.min(100, coverageProgress * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Canvas */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="rounded-2xl border-2 border-dashed border-slate-200 bg-white touch-none cursor-crosshair"
          style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />

        {/* Completion overlay with star rating */}
        {feedback === 'good' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-50/85 rounded-2xl animate-[fadeIn_0.3s_ease-out]">
            <span className="text-5xl text-emerald-600 font-bold animate-[scaleIn_0.4s_ease-out]">&#10003;</span>
            <div className="flex gap-1 mt-2">
              {[1, 2, 3].map((s) => (
                <span
                  key={s}
                  className={`text-2xl transition-all ${
                    s <= starRating ? 'opacity-100 scale-110' : 'opacity-20'
                  }`}
                  style={{ animationDelay: `${s * 0.15}s` }}
                >
                  &#11088;
                </span>
              ))}
            </div>
            <p className="text-sm font-bold text-emerald-700 mt-1">
              {language === 'ar' ? '!أحسنت' : 'Well done!'}
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        {feedback === 'try_again' && (
          <span
            className={`text-sm text-amber-600 font-medium ${language === 'ar' ? 'font-cairo' : ''}`}
          >
            {language === 'ar' ? 'حاول مرة أخرى!' : 'Try again!'}
          </span>
        )}
        {!completed && (
          <button
            type="button"
            onClick={handleReset}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors min-h-[44px]"
          >
            {language === 'ar' ? 'مسح' : 'Clear'}
          </button>
        )}
      </div>

      {/* Instruction */}
      {!completed && !feedback && (
        <p className={`text-sm text-slate-500 text-center ${language === 'ar' ? 'font-cairo' : ''}`}>
          {language === 'ar'
            ? '✏️ تتبع النص بإصبعك فوق الخطوط الرمادية'
            : '✏️ Trace over the gray guide with your finger'}
        </p>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          0% { transform: scale(0); }
          70% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
