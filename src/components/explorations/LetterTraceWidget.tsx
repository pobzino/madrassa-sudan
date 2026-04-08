'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExplorationWidgetProps, LetterTraceConfig } from '@/lib/explorations/types';

const VIEWBOX = 200;
const CANVAS_SIZE = 300;

interface DrawnPoint {
  x: number;
  y: number;
}

export default function LetterTraceWidget({
  config,
  language,
  onComplete,
}: ExplorationWidgetProps<LetterTraceConfig>) {
  const displayText = config.text || config.letter || '';
  const { script } = config;
  const hasVectorPaths = config.stroke_paths && config.stroke_paths.length > 0;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [allStrokes, setAllStrokes] = useState<DrawnPoint[][]>([]);
  const [currentStroke, setCurrentStroke] = useState<DrawnPoint[]>([]);
  const [completed, setCompleted] = useState(false);
  const [feedback, setFeedback] = useState<'good' | 'try_again' | null>(null);
  const [checking, setChecking] = useState(false);
  const [starRating, setStarRating] = useState(0);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const completedRef = useRef(false);

  const scale = CANVAS_SIZE / VIEWBOX;

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
          ctx.lineWidth = 16;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          const pts = path.points;
          ctx.moveTo(pts[0].x * scale, pts[0].y * scale);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x * scale, pts[i].y * scale);
          }
          ctx.stroke();

          if (pts.length >= 2 && allStrokes.length === 0 && currentStroke.length === 0) {
            const ax = pts[0].x * scale;
            const ay = pts[0].y * scale;
            ctx.beginPath();
            ctx.arc(ax, ay, 7, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(59, 130, 246, 0.6)';
            ctx.fill();
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

    // Draw student strokes
    const strokeColor = completed
      ? '#10b981'
      : feedback === 'try_again'
        ? '#ef4444'
        : '#3b82f6';
    const drawStroke = (points: DrawnPoint[]) => {
      if (points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(points[0].x * scale, points[0].y * scale);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x * scale, points[i].y * scale);
      }
      ctx.stroke();
    };
    for (const stroke of allStrokes) drawStroke(stroke);
    drawStroke(currentStroke);
  }, [config.stroke_paths, hasVectorPaths, displayText, script, allStrokes, currentStroke, scale, completed, feedback]);

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
      if (completed || checking) return;
      setDrawing(true);
      setFeedback(null);
      setAiFeedback(null);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      const pt = getCanvasPoint(e.clientX, e.clientY);
      setCurrentStroke([pt]);
    },
    [completed, checking, getCanvasPoint]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drawing || completed) return;
      const pt = getCanvasPoint(e.clientX, e.clientY);
      setCurrentStroke((prev) => [...prev, pt]);
    },
    [drawing, completed, getCanvasPoint]
  );

  const captureCanvas = useCallback((): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    // Export at 1x resolution for a small payload
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = CANVAS_SIZE;
    exportCanvas.height = CANVAS_SIZE;
    const ctx = exportCanvas.getContext('2d')!;
    ctx.drawImage(canvas, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
    return exportCanvas.toDataURL('image/png', 0.8);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (!drawing) return;
    setDrawing(false);
    if (currentStroke.length > 1) {
      setAllStrokes((prev) => [...prev, currentStroke]);
    }
    setCurrentStroke([]);
  }, [drawing, currentStroke]);

  const hasDrawn = allStrokes.length > 0;

  const handleSubmit = useCallback(async () => {
    if (completedRef.current || checking || !hasDrawn) return;

    const imageDataUrl = captureCanvas();
    if (!imageDataUrl) return;

    setChecking(true);
    try {
      const res = await fetch('/api/lesson-progress/trace-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_data_url: imageDataUrl,
          target_text: displayText,
          script,
        }),
      });

      if (!res.ok) {
        completedRef.current = true;
        setCompleted(true);
        setFeedback('good');
        setStarRating(2);
        setTimeout(() => onComplete(), 500);
        return;
      }

      const data = await res.json();
      if (data.isCorrect) {
        completedRef.current = true;
        setCompleted(true);
        setFeedback('good');
        setStarRating(data.stars || 2);
        if (data.feedback) setAiFeedback(data.feedback);
        setTimeout(() => onComplete(), 500);
      } else {
        setFeedback('try_again');
        if (data.feedback) setAiFeedback(data.feedback);
      }
    } catch {
      completedRef.current = true;
      setCompleted(true);
      setFeedback('good');
      setStarRating(2);
      setTimeout(() => onComplete(), 500);
    } finally {
      setChecking(false);
    }
  }, [checking, hasDrawn, captureCanvas, displayText, script, onComplete]);

  const handleReset = useCallback(() => {
    setAllStrokes([]);
    setCurrentStroke([]);
    setFeedback(null);
    setAiFeedback(null);
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

        {/* Checking overlay */}
        {checking && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70 rounded-2xl">
            <div className="w-8 h-8 border-3 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500 mt-2">
              {language === 'ar' ? 'جاري التحقق...' : 'Checking...'}
            </p>
          </div>
        )}

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
              {aiFeedback || (language === 'ar' ? '!أحسنت' : 'Well done!')}
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col items-center gap-2">
        {feedback === 'try_again' && (
          <span
            className={`text-sm text-amber-600 font-medium ${language === 'ar' ? 'font-cairo' : ''}`}
          >
            {aiFeedback || (language === 'ar' ? 'حاول مرة أخرى!' : 'Try again!')}
          </span>
        )}
        {!completed && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleReset}
              disabled={checking || !hasDrawn}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors min-h-[44px] disabled:opacity-50"
            >
              {language === 'ar' ? 'مسح' : 'Clear'}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={checking || !hasDrawn}
              className="rounded-full bg-blue-500 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-600 transition-colors min-h-[44px] disabled:opacity-50 shadow-sm"
            >
              {checking
                ? (language === 'ar' ? 'جاري التحقق...' : 'Checking...')
                : (language === 'ar' ? 'تحقق ✓' : 'Check ✓')}
            </button>
          </div>
        )}
      </div>

      {/* Instruction */}
      {!completed && !feedback && !checking && (
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
