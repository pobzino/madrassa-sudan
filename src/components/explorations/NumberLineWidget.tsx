'use client';

import { useCallback, useRef, useState } from 'react';
import type { ExplorationWidgetProps, NumberLineConfig } from '@/lib/explorations/types';

const SVG_WIDTH = 600;
const SVG_HEIGHT = 160;
const LINE_Y = 80;
const LINE_X_START = 60;
const LINE_X_END = 540;
const LINE_LENGTH = LINE_X_END - LINE_X_START;
const HANDLE_R = 18;

function valueToX(value: number, min: number, max: number): number {
  return LINE_X_START + ((value - min) / (max - min)) * LINE_LENGTH;
}

function xToValue(x: number, min: number, max: number, step?: number): number {
  const raw = min + ((x - LINE_X_START) / LINE_LENGTH) * (max - min);
  const clamped = Math.max(min, Math.min(max, raw));
  if (step && step > 0) {
    return Math.round(clamped / step) * step;
  }
  return Math.round(clamped * 100) / 100;
}

function formatValue(v: number): string {
  if (Number.isInteger(v)) return v.toString();
  return v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export default function NumberLineWidget({
  config,
  language,
  onComplete,
}: ExplorationWidgetProps<NumberLineConfig>) {
  const { min, max, target, tolerance, step, unit_label_ar, unit_label_en } = config;
  const [value, setValue] = useState((min + max) / 2);
  const [completed, setCompleted] = useState(false);
  const draggingRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const unitLabel = language === 'ar' ? unit_label_ar : unit_label_en;

  const getValueFromEvent = useCallback(
    (clientX: number) => {
      const svg = svgRef.current;
      if (!svg) return value;
      const rect = svg.getBoundingClientRect();
      const svgX = ((clientX - rect.left) / rect.width) * SVG_WIDTH;
      return xToValue(svgX, min, max, step);
    },
    [min, max, step, value]
  );

  const checkComplete = useCallback(
    (v: number) => {
      if (!completed && Math.abs(v - target) <= tolerance) {
        setCompleted(true);
        onComplete();
      }
    },
    [completed, target, tolerance, onComplete]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (completed) return;
      draggingRef.current = true;
      (e.target as SVGElement).setPointerCapture(e.pointerId);
      const v = getValueFromEvent(e.clientX);
      setValue(v);
      checkComplete(v);
    },
    [completed, getValueFromEvent, checkComplete]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current || completed) return;
      const v = getValueFromEvent(e.clientX);
      setValue(v);
      checkComplete(v);
    },
    [completed, getValueFromEvent, checkComplete]
  );

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  // Tick marks
  const effectiveStep = step && step > 0 ? step : (max - min) / 10;
  const ticks: number[] = [];
  for (let v = min; v <= max + effectiveStep * 0.01; v += effectiveStep) {
    ticks.push(Math.round(v * 1000) / 1000);
  }

  const handleX = valueToX(value, min, max);
  const isClose = Math.abs(value - target) <= tolerance;
  const progress = 1 - Math.min(1, Math.abs(value - target) / (max - min));

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-lg mx-auto px-4 select-none rounded-2xl bg-gradient-to-b from-blue-50/60 to-white py-6">
      {/* Current value display */}
      <div className="flex items-center gap-2">
        <span
          className={`text-4xl font-bold tabular-nums transition-colors ${
            completed ? 'text-emerald-600 scale-110' : isClose ? 'text-amber-500' : 'text-slate-700'
          }`}
          style={{ transition: 'transform 0.3s, color 0.3s' }}
        >
          {formatValue(value)}
        </span>
        {unitLabel && (
          <span className="text-lg text-slate-500">{unitLabel}</span>
        )}
      </div>

      {/* Completion celebration */}
      {completed && (
        <div className="flex flex-col items-center gap-1 animate-[bounceIn_0.5s_ease-out]">
          <span className="text-4xl animate-[scaleIn_0.4s_ease-out]">&#10003;</span>
          <p className="text-sm font-bold text-emerald-600 animate-[bounceText_0.6s_ease-out]">
            {language === 'ar' ? '!أحسنت' : 'Well done!'}
          </p>
        </div>
      )}

      {/* SVG number line */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className="w-full touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Gradient definition for the line */}
        <defs>
          <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#93c5fd" />
            <stop offset="50%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
        </defs>

        {/* Main line with gradient */}
        <line
          x1={LINE_X_START}
          y1={LINE_Y}
          x2={LINE_X_END}
          y2={LINE_Y}
          stroke="url(#lineGrad)"
          strokeWidth={4}
          strokeLinecap="round"
        />

        {/* Target zone (shown after completion) */}
        {completed && (
          <rect
            x={valueToX(target - tolerance, min, max)}
            y={LINE_Y - 22}
            width={valueToX(target + tolerance, min, max) - valueToX(target - tolerance, min, max)}
            height={44}
            rx={10}
            fill="#10b981"
            opacity={0.18}
            className="animate-[fadeIn_0.3s_ease-out]"
          />
        )}

        {/* Tick marks */}
        {ticks.map((v) => {
          const x = valueToX(v, min, max);
          const isMajor = v === min || v === max || v === Math.round((min + max) / 2 * 100) / 100;
          return (
            <g key={v}>
              <line
                x1={x}
                y1={LINE_Y - (isMajor ? 14 : 9)}
                x2={x}
                y2={LINE_Y + (isMajor ? 14 : 9)}
                stroke="#94a3b8"
                strokeWidth={isMajor ? 2.5 : 1.5}
              />
              {isMajor && (
                <text
                  x={x}
                  y={LINE_Y + 34}
                  textAnchor="middle"
                  className="fill-slate-500"
                  style={{ fontSize: 14, fontWeight: 600 }}
                >
                  {formatValue(v)}
                </text>
              )}
            </g>
          );
        })}

        {/* Pulsing invite ring (before dragging starts) */}
        {!completed && !draggingRef.current && (
          <circle
            cx={handleX}
            cy={LINE_Y}
            r={HANDLE_R + 6}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={2}
            opacity={0.4}
            className="animate-[ping_2s_ease-in-out_infinite]"
          />
        )}

        {/* Draggable handle */}
        <circle
          cx={handleX}
          cy={LINE_Y}
          r={HANDLE_R}
          fill={completed ? '#10b981' : isClose ? '#f59e0b' : '#3b82f6'}
          stroke="white"
          strokeWidth={3.5}
          className={completed ? '' : 'cursor-grab active:cursor-grabbing'}
          style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.2))', transition: 'fill 0.2s' }}
        />

        {/* Value on handle */}
        <text
          x={handleX}
          y={LINE_Y + 1}
          textAnchor="middle"
          dominantBaseline="central"
          fill="white"
          style={{ fontSize: 11, fontWeight: 700 }}
          className="pointer-events-none"
        >
          {formatValue(value)}
        </text>
      </svg>

      {/* Instruction */}
      {!completed && (
        <p className={`text-sm text-slate-500 text-center ${language === 'ar' ? 'font-cairo' : ''}`}>
          {language === 'ar'
            ? '👆 اسحب الدائرة لتضع العدد في المكان الصحيح'
            : '👆 Drag the handle to place the number'}
        </p>
      )}

      <style jsx>{`
        @keyframes bounceIn {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes scaleIn {
          0% { transform: scale(0); }
          70% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }
        @keyframes bounceText {
          0% { transform: translateY(10px); opacity: 0; }
          60% { transform: translateY(-4px); }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 0.18; }
        }
        @keyframes ping {
          0% { r: ${HANDLE_R + 4}; opacity: 0.5; }
          50% { r: ${HANDLE_R + 12}; opacity: 0; }
          100% { r: ${HANDLE_R + 4}; opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
