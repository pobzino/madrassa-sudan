'use client';

import { useState } from 'react';
import type { ExplorationWidgetProps, ColorPickerConfig } from '@/lib/explorations/types';

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

export default function ColorPickerWidget({
  config,
  language,
  onComplete,
}: ExplorationWidgetProps<ColorPickerConfig>) {
  const { target_color, tolerance } = config;
  const targetRgb = hexToRgb(target_color);

  const [r, setR] = useState(128);
  const [g, setG] = useState(128);
  const [b, setB] = useState(128);
  const [completed, setCompleted] = useState(false);

  const mixedHex = rgbToHex(r, g, b);
  const dist = colorDistance([r, g, b], targetRgb);
  const maxDist = 255;
  const proximity = Math.max(0, 1 - dist / maxDist);

  function handleChange(channel: 'r' | 'g' | 'b', v: number) {
    if (completed) return;
    const nr = channel === 'r' ? v : r;
    const ng = channel === 'g' ? v : g;
    const nb = channel === 'b' ? v : b;

    if (channel === 'r') setR(v);
    else if (channel === 'g') setG(v);
    else setB(v);

    const d = colorDistance([nr, ng, nb], targetRgb);
    if (d <= tolerance) {
      setCompleted(true);
      setTimeout(() => onComplete(), 500);
    }
  }

  return (
    <div className="flex flex-col items-center gap-5 w-full max-w-sm mx-auto px-4 rounded-2xl bg-gradient-to-b from-purple-50/60 to-white py-6">
      {/* Color swatches */}
      <div className="flex items-center gap-5">
        <div className="text-center">
          <p className="text-xs font-medium text-slate-400 mb-1.5">
            {language === 'ar' ? 'الهدف' : 'Target'}
          </p>
          <div
            className="w-24 h-24 rounded-2xl shadow-inner border-2 border-white ring-1 ring-slate-200"
            style={{ backgroundColor: target_color }}
          />
        </div>

        <div className="text-3xl text-slate-300">=</div>

        <div className="text-center">
          <p className="text-xs font-medium text-slate-400 mb-1.5">
            {language === 'ar' ? 'مزيجك' : 'Your mix'}
          </p>
          <div
            className={`w-24 h-24 rounded-2xl shadow-inner border-2 transition-all ${
              completed ? 'border-emerald-400 ring-2 ring-emerald-300' : 'border-white ring-1 ring-slate-200'
            }`}
            style={{ backgroundColor: mixedHex }}
          />
        </div>
      </div>

      {/* Proximity meter */}
      <div className="w-full">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-slate-400">{language === 'ar' ? 'بعيد' : 'Far'}</span>
          <span className="text-[10px] text-slate-400">{language === 'ar' ? 'قريب' : 'Close'}</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${proximity * 100}%`,
              background: proximity > 0.8
                ? 'linear-gradient(90deg, #fbbf24, #10b981)'
                : 'linear-gradient(90deg, #ef4444, #fbbf24)',
            }}
          />
        </div>
      </div>

      {/* Completion celebration */}
      {completed && (
        <div className="flex flex-col items-center gap-1 animate-[bounceIn_0.5s_ease-out]">
          <span className="text-4xl animate-[sparkle_0.6s_ease-out]">&#10003;</span>
          <p className="text-sm font-bold text-emerald-600 animate-[bounceText_0.6s_ease-out]">
            {language === 'ar' ? 'تطابق! أحسنت!' : 'Match! Well done!'}
          </p>
        </div>
      )}

      {/* RGB Sliders with color-gradient tracks */}
      <div className="w-full space-y-4">
        {([
          { channel: 'r' as const, val: r, label: 'R', color: '#ef4444', gradient: `linear-gradient(90deg, rgb(0,${g},${b}), rgb(255,${g},${b}))` },
          { channel: 'g' as const, val: g, label: 'G', color: '#22c55e', gradient: `linear-gradient(90deg, rgb(${r},0,${b}), rgb(${r},255,${b}))` },
          { channel: 'b' as const, val: b, label: 'B', color: '#3b82f6', gradient: `linear-gradient(90deg, rgb(${r},${g},0), rgb(${r},${g},255))` },
        ]).map(({ channel, val, label, color, gradient }) => (
          <div key={channel} className="flex items-center gap-3">
            <span className="w-5 text-sm font-bold" style={{ color }}>{label}</span>
            <div className="flex-1 relative h-6 flex items-center">
              <div
                className="absolute inset-0 rounded-full h-3 top-1/2 -translate-y-1/2"
                style={{ background: gradient }}
              />
              <input
                type="range"
                min={0}
                max={255}
                value={val}
                onChange={(e) => handleChange(channel, Number(e.target.value))}
                disabled={completed}
                className="relative w-full h-6 appearance-none cursor-pointer bg-transparent z-10 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:cursor-pointer"
                style={{ ['--thumb-border-color' as string]: color }}
              />
            </div>
            <span className="w-10 text-xs text-slate-500 tabular-nums text-right font-medium">{val}</span>
          </div>
        ))}
      </div>

      {/* Hint */}
      {!completed && (
        <p className="text-sm text-slate-400 text-center">
          {language === 'ar'
            ? '🎨 حرك الأشرطة لمطابقة اللون المطلوب'
            : '🎨 Adjust the sliders to match the target color'}
        </p>
      )}

      <style jsx>{`
        @keyframes bounceIn {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes sparkle {
          0% { transform: scale(0) rotate(-20deg); }
          60% { transform: scale(1.3) rotate(10deg); }
          100% { transform: scale(1) rotate(0); }
        }
        @keyframes bounceText {
          0% { transform: translateY(10px); opacity: 0; }
          60% { transform: translateY(-4px); }
          100% { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
