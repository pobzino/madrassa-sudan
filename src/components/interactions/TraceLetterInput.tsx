'use client';

import { RotateCcw, Sparkles, Undo2, Volume2 } from 'lucide-react';
import type { InteractionAnswer, TraceLetterConfig } from '@/lib/interactions/types';
import { TRACE_LETTERS, traceLetterLabel, type TraceLetterTemplate } from '@/lib/interactions/trace-letter';
import { arrowPath, penAt, startMarkers, tracePath, useReducedMotion, useTraceDemo, useTracePad, useTraceTemplate } from './tracePad';

interface Props {
  config: TraceLetterConfig;
  language: 'ar' | 'en';
  answer: Extract<InteractionAnswer, { type: 'trace_letter' }> | null;
  onAnswerChange?: (answer: InteractionAnswer) => void;
  disabled?: boolean;
}

const COPY = {
  ar: {
    hint: (label: string) => `تتبّع ${label} بإصبعك`,
    watch: 'شاهدني',
    undo: 'تراجع',
    clear: 'ابدأ من جديد',
    sound: 'استمع',
    loading: 'نجهّز الحرف…',
    missing: 'هذا الحرف غير جاهز بعد.',
    board: (label: string) => `لوح تتبّع ${label}`,
  },
  en: {
    hint: (label: string) => `Trace ${label} with your finger`,
    watch: 'Watch me',
    undo: 'Undo',
    clear: 'Start again',
    sound: 'Listen',
    loading: 'Getting the letter ready…',
    missing: 'This letter is not ready yet.',
    board: (label: string) => `Tracing board for ${label}`,
  },
};

/** The letter's track, numbered starts and arrows, the demo pen and the child's ink, on a 0..100 box. */
export function TraceBoard({
  template,
  strokes,
  current,
  demo,
  inkColor = '#1D4ED8',
  numberLabel = String,
}: {
  template: TraceLetterTemplate;
  strokes: number[][][];
  current: number[][] | null;
  demo: { stroke: number; t: number } | null;
  inkColor?: string;
  /** Stroke numbers in the reader's digits. */
  numberLabel?: (n: number) => string;
}) {
  const pen = demo ? penAt(template.strokes[demo.stroke], demo.t) : null;
  const starts = startMarkers(template);
  return (
    <>
      {template.strokes.map((stroke, index) => (
        <path
          key={`track-${index}`}
          d={tracePath(stroke.points)}
          fill="none"
          stroke="#DDEFE3"
          strokeWidth={Math.max(5, (stroke.width ?? 0.06) * 100 + 2)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {template.strokes.map((stroke, index) => (
        <path key={`dash-${index}`} d={tracePath(stroke.points)} fill="none" stroke="#8FC5A3" strokeWidth={0.9} strokeDasharray="1.4 2.6" strokeLinecap="round" />
      ))}
      {template.strokes.map((stroke, index) => {
        const arrow = arrowPath(stroke);
        return arrow ? <path key={`arrow-${index}`} d={arrow} fill="none" stroke="#2E8B57" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" /> : null;
      })}
      {demo &&
        template.strokes.slice(0, demo.stroke + 1).map((stroke, index) => (
          <path
            key={`demo-${index}`}
            d={tracePath(stroke.points)}
            pathLength={1}
            fill="none"
            stroke="#0E9F5A"
            strokeWidth={Math.max(3.4, (stroke.width ?? 0.06) * 100 * 0.55)}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={index < demo.stroke ? undefined : `${Math.max(0.001, demo.t)} 1`}
          />
        ))}
      {strokes.map((stroke, index) => (
        <path key={`ink-${index}`} d={tracePath(stroke)} fill="none" stroke={inkColor} strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {current && <path d={tracePath(current)} fill="none" stroke={inkColor} strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" />}
      {template.strokes.map((stroke, index) => (
        <g key={`start-${index}`} opacity={strokes.length > index ? 0.35 : 1}>
          <circle cx={starts[index][0] * 100} cy={starts[index][1] * 100} r={3.1} fill="#0E7A45" stroke="#fff" strokeWidth={0.8} />
          <text x={starts[index][0] * 100} y={starts[index][1] * 100 + 1.25} fill="#fff" textAnchor="middle" fontSize={3.6} fontWeight={700}>
            {numberLabel(index + 1)}
          </text>
        </g>
      ))}
      {pen && (
        <g transform={`translate(${pen[0] * 100} ${pen[1] * 100})`} aria-hidden="true">
          <circle r={4.2} fill="#FDE68A" opacity={0.55} />
          <path d="M0 -3.6 L1 -1 L3.6 0 L1 1 L0 3.6 L-1 1 L-3.6 0 L-1 -1 Z" fill="#F59E0B" stroke="#fff" strokeWidth={0.5} />
        </g>
      )}
    </>
  );
}

export default function TraceLetterInput({ config, language, answer, onAnswerChange, disabled = false }: Props) {
  const copy = COPY[language];
  const { template, loading } = useTraceTemplate(config);
  const reducedMotion = useReducedMotion();
  const { demo, play, stop, playing } = useTraceDemo(template, reducedMotion);
  const strokes = answer?.strokes ?? [];
  const pad = useTracePad({
    strokes,
    disabled: disabled || !template,
    onStrokes: (next) => onAnswerChange?.({ type: 'trace_letter', strokes: next }),
    onStrokeStart: stop,
  });
  const label = traceLetterLabel(config, language);

  return (
    <div className="mx-auto w-full max-w-[460px] select-none" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-base font-bold text-slate-700 [unicode-bidi:plaintext]">{copy.hint(label)}</p>
        <div className="flex shrink-0 items-center gap-2">
          {config.audio_url && (
            <button
              type="button"
              onClick={() => void new Audio(config.audio_url!).play().catch(() => undefined)}
              aria-label={copy.sound}
              title={copy.sound}
              className="grid h-11 w-11 place-items-center rounded-full bg-emerald-50 text-emerald-800"
            >
              <Volume2 className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={playing ? stop : play}
            disabled={!template}
            className="inline-flex h-11 items-center gap-1.5 rounded-full bg-emerald-700 px-4 text-sm font-bold text-white shadow-[0_3px_0_#065F46] active:translate-y-0.5 active:shadow-none disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {copy.watch}
          </button>
        </div>
      </div>
      <div className="relative overflow-hidden rounded-[28px] border-2 border-emerald-100 bg-white shadow-sm">
        <svg
          viewBox="0 0 100 100"
          role="img"
          aria-label={copy.board(label)}
          className="block aspect-square w-full"
          style={{ touchAction: 'none', cursor: disabled || !template ? 'default' : 'crosshair' }}
          {...pad.handlers}
        >
          <rect width="100" height="100" fill="#FFFFFF" />
          <path d="M6 50H94M50 6V94" stroke="#F1F5F9" strokeWidth={0.6} />
          {template && (
            <TraceBoard
              template={template}
              strokes={strokes}
              current={pad.current}
              demo={demo}
              numberLabel={(n) => (language === 'ar' ? String.fromCharCode(0x0660 + n) : String(n))}
            />
          )}
        </svg>
        {!template && (
          <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm font-semibold text-slate-500">
            {loading ? copy.loading : copy.missing}
          </p>
        )}
      </div>
      {!disabled && template && (
        <div className="mt-3 flex justify-center gap-4">
          <button
            type="button"
            onClick={pad.undo}
            disabled={!strokes.length}
            aria-label={copy.undo}
            title={copy.undo}
            className="grid h-12 w-12 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm disabled:opacity-40"
          >
            <Undo2 className="h-5 w-5 rtl:-scale-x-100" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={pad.clear}
            disabled={!strokes.length}
            aria-label={copy.clear}
            title={copy.clear}
            className="grid h-12 w-12 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm disabled:opacity-40"
          >
            <RotateCcw className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

export function traceLetterOptions(script: 'ar' | 'en') {
  return [...TRACE_LETTERS[script]];
}
