'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { InteractionAnswer, TraceLetterConfig } from '@/lib/interactions/types';
import { getTraceLetterTemplate } from '@/lib/interactions/trace-letter';

interface Props {
  config: TraceLetterConfig;
  language: 'ar' | 'en';
  answer: Extract<InteractionAnswer, { type: 'trace_letter' }> | null;
  onAnswerChange?: (answer: InteractionAnswer) => void;
  disabled?: boolean;
}

type Point = [number, number];
const letters = {
  ar: [...'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'],
  en: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'],
};

function pathData(points: readonly Point[]): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${(x * 100).toFixed(2)} ${(y * 100).toFixed(2)}`).join(' ');
}

function arrowAt(points: readonly Point[]): Point[] {
  const index = Math.max(1, Math.floor((points.length - 1) * 0.72));
  const [x, y] = points[index];
  const [px, py] = points[index - 1];
  const angle = Math.atan2(y - py, x - px);
  const size = 0.034;
  return [
    [x - size * Math.cos(angle - 0.52), y - size * Math.sin(angle - 0.52)],
    [x, y],
    [x - size * Math.cos(angle + 0.52), y - size * Math.sin(angle + 0.52)],
  ];
}

export default function TraceLetterInput({ config, language, answer, onAnswerChange, disabled = false }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const strokes = answer?.strokes ?? [];
  const [current, setCurrent] = useState<number[][] | null>(null);
  const [demoStep, setDemoStep] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAr = language === 'ar';
  const template = useMemo(() => getTraceLetterTemplate(config), [config]);
  const configLetter = config.script === 'en'
    ? (config.case === 'lower' ? config.letter.toLowerCase() : config.letter.toUpperCase())
    : config.letter;

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const announce = (next: number[][][]) => {
    onAnswerChange?.({ type: 'trace_letter', strokes: next });
  };

  const pointFromEvent = (event: React.PointerEvent<SVGSVGElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    ];
  };

  const startStroke = (event: React.PointerEvent<SVGSVGElement>) => {
    if (disabled || demoStep >= 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    setCurrent([point]);
  };

  const moveStroke = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!current || disabled) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    setCurrent((active) => active ? [...active, point] : null);
  };

  const finishStroke = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!current) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    announce([...strokes, [...current, point]]);
    setCurrent(null);
  };

  const watchDemo = () => {
    if (!template) return;
    if (timer.current) clearTimeout(timer.current);
    setDemoStep(0);
  };

  useEffect(() => {
    if (demoStep < 0 || !template) return;
    timer.current = setTimeout(() => {
      setDemoStep((step) => step + 1 >= template.strokes.length ? -1 : step + 1);
    }, 800);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [demoStep, template]);

  const copy = isAr
    ? { watch: 'شاهد طريقة الكتابة', undo: 'تراجع', clear: 'مسح', sound: 'استمع', hint: 'اكتب بإصبعك فوق الحرف', invalid: 'اختر حرفاً صحيحاً' }
    : { watch: 'Watch me', undo: 'Undo', clear: 'Clear', sound: 'Listen', hint: 'Trace the letter with your finger', invalid: 'Choose a valid letter' };

  if (!template) return <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{copy.invalid}</p>;

  const templatePaths = template.strokes.map((stroke) => pathData(stroke.points));
  const glyphFont = config.script === 'ar' ? 'Amal Trace Naskh, serif' : 'Amal Trace Print, sans-serif';

  return (
    <div className="mx-auto w-full max-w-[520px] select-none" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-700">{copy.hint}</p>
        </div>
        <div className="flex items-center gap-2">
          {config.audio_url && (
            <button type="button" onClick={() => new Audio(config.audio_url!).play()} className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">{copy.sound}</button>
          )}
          <button type="button" onClick={watchDemo} disabled={disabled || demoStep >= 0} className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{copy.watch}</button>
        </div>
      </div>
      <div className="overflow-hidden rounded-[28px] border-2 border-emerald-100 bg-white shadow-sm">
        <svg
          ref={svgRef}
          viewBox="0 0 100 100"
          role="img"
          aria-label={isAr ? `تتبّع الحرف ${configLetter}` : `Trace the letter ${configLetter}`}
          className="block aspect-square w-full"
          style={{ touchAction: 'none', cursor: disabled ? 'default' : 'crosshair' }}
          onPointerDown={startStroke}
          onPointerMove={moveStroke}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
        >
          <defs>
            <marker id="trace-arrow" markerWidth="4" markerHeight="4" refX="2.5" refY="2" orient="auto" markerUnits="userSpaceOnUse">
              <path d="M0,0 L4,2 L0,4 z" fill="#1b8a50" />
            </marker>
          </defs>
          <rect width="100" height="100" fill="#fff" />
          <text x="50" y="69" textAnchor="middle" direction={config.script === 'ar' ? 'rtl' : 'ltr'} style={{ fontFamily: glyphFont, fontSize: config.script === 'ar' ? 78 : 82, fill: '#e8f1eb', fontWeight: 700 }}>{configLetter}</text>
          {template.strokes.map((stroke, index) => (
            <g key={`guide-${index}`} opacity={demoStep === index ? 1 : 0.92}>
              <path d={templatePaths[index]} fill="none" stroke="#bdd8c7" strokeWidth={Math.max(1.2, (stroke.width ?? 0.025) * 100)} strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={stroke.points[0][0] * 100} cy={stroke.points[0][1] * 100} r="2.15" fill="#118447" />
              <text x={stroke.points[0][0] * 100} y={stroke.points[0][1] * 100 + 1.2} fill="white" textAnchor="middle" fontSize="2.3" fontWeight="700">{index + 1}</text>
              {stroke.kind !== 'dot' && stroke.kind !== 'hamza' && <path d={pathData(arrowAt(stroke.points))} fill="none" stroke="#1b8a50" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" markerEnd="url(#trace-arrow)" />}
            </g>
          ))}
          {template.strokes.map((stroke, index) => (
            <path
              key={`demo-${index}`}
              d={templatePaths[index]}
              fill="none"
              stroke="#087f3c"
              strokeWidth={Math.max(2.4, (stroke.width ?? 0.025) * 100)}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="2 200"
              strokeDashoffset="0"
              className={demoStep === index ? 'trace-letter-demo-stroke' : ''}
              style={{ opacity: demoStep >= index ? 1 : 0, strokeDasharray: demoStep > index ? '200 0' : '2 200', ...(demoStep === index ? { animation: 'trace-letter-draw 0.75s ease-out forwards' } : {}) }}
            />
          ))}
          {strokes.map((stroke, index) => <polyline key={`answer-${index}`} points={stroke.map(([x, y]) => `${x * 100},${y * 100}`).join(' ')} fill="none" stroke="#154d9b" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />)}
          {current && <polyline points={current.map(([x, y]) => `${x * 100},${y * 100}`).join(' ')} fill="none" stroke="#154d9b" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
      </div>
      <style jsx global>{`
        @font-face { font-family: 'Amal Trace Naskh'; src: url('/trace-letter/AmalTraceNaskh.ttf') format('truetype'); font-display: swap; }
        @font-face { font-family: 'Amal Trace Print'; src: url('/trace-letter/AmalTracePrint.ttf') format('truetype'); font-display: swap; }
        @keyframes trace-letter-draw { from { stroke-dasharray: 0 200; } to { stroke-dasharray: 200 0; } }
      `}</style>
      {!disabled && (
        <div className="mt-3 flex justify-between gap-3">
          <button type="button" onClick={() => announce(strokes.slice(0, -1))} disabled={!strokes.length} className="min-h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 disabled:opacity-40">{copy.undo}</button>
          <button type="button" onClick={() => announce([])} disabled={!strokes.length} className="min-h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 disabled:opacity-40">{copy.clear}</button>
        </div>
      )}
    </div>
  );
}

export function traceLetterOptions(script: 'ar' | 'en') { return letters[script]; }
