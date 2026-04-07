'use client';

import { useCallback, useState } from 'react';
import type { ExplorationWidgetProps, ImageHotspotConfig } from '@/lib/explorations/types';

export default function ImageHotspotWidget({
  config,
  language,
  onComplete,
}: ExplorationWidgetProps<ImageHotspotConfig>) {
  const { image_url, hotspots } = config;
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [completed, setCompleted] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState<number | null>(null);

  const handleTap = useCallback(
    (index: number) => {
      if (completed) return;
      setRevealed((prev) => {
        const next = new Set(prev);
        next.add(index);
        if (next.size === hotspots.length && !completed) {
          setCompleted(true);
          setTimeout(() => onComplete(), 300);
        }
        return next;
      });
      setActiveTooltip(index);
      setTimeout(() => {
        setActiveTooltip((cur) => (cur === index ? null : cur));
      }, 3000);
    },
    [completed, hotspots.length, onComplete]
  );

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-lg mx-auto px-4 rounded-2xl bg-gradient-to-b from-teal-50/60 to-white py-6">
      {/* Progress dots */}
      <div className="flex items-center gap-2">
        <span className={`text-sm text-slate-500 ${language === 'ar' ? 'font-cairo' : ''}`}>
          {language === 'ar' ? 'اكتشف:' : 'Discovered:'}
        </span>
        <div className="flex gap-1.5">
          {hotspots.map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                revealed.has(i) ? 'bg-emerald-500 scale-110' : 'bg-slate-200'
              }`}
            />
          ))}
        </div>
        <span className="text-sm font-bold text-slate-700">
          {revealed.size}/{hotspots.length}
        </span>
      </div>

      {/* Image with hotspots */}
      <div className="relative w-full rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image_url}
          alt=""
          className="w-full block"
          draggable={false}
        />

        {/* Hotspot markers */}
        {hotspots.map((hotspot, i) => {
          const isRevealed = revealed.has(i);
          const isActive = activeTooltip === i;
          const label = language === 'ar' ? hotspot.label_ar : hotspot.label_en;

          return (
            <div
              key={i}
              className="absolute"
              style={{
                left: `${hotspot.x_pct}%`,
                top: `${hotspot.y_pct}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              {/* Pulsing rings (before reveal) */}
              {!isRevealed && (
                <button
                  type="button"
                  onClick={() => handleTap(i)}
                  className="relative w-12 h-12 rounded-full flex items-center justify-center"
                  aria-label={`Hotspot ${i + 1}`}
                >
                  {/* Outer pulsing ring */}
                  <span className="absolute inset-0 rounded-full border-2 border-blue-400 animate-[ringPulse_2s_ease-in-out_infinite]" />
                  {/* Middle pulsing ring */}
                  <span className="absolute inset-1 rounded-full border border-blue-300 animate-[ringPulse_2s_ease-in-out_0.5s_infinite]" />
                  {/* Core dot */}
                  <span className="relative w-6 h-6 rounded-full bg-blue-500 border-2 border-white shadow-lg" />
                </button>
              )}

              {/* Revealed marker */}
              {isRevealed && (
                <button
                  type="button"
                  onClick={() =>
                    setActiveTooltip((cur) => (cur === i ? null : i))
                  }
                  className="w-12 h-12 rounded-full bg-emerald-500 border-2 border-white shadow-lg flex items-center justify-center text-lg transition-transform hover:scale-110 animate-[revealPop_0.4s_ease-out]"
                >
                  {hotspot.emoji || '✓'}
                </button>
              )}

              {/* Tooltip with smooth reveal */}
              {isActive && isRevealed && (
                <div
                  className="absolute z-10 bottom-full mb-2 left-1/2 -translate-x-1/2
                    bg-white rounded-2xl shadow-xl border border-slate-200 px-4 py-3
                    min-w-[130px] max-w-[220px] text-center
                    animate-[tooltipReveal_0.3s_ease-out]"
                >
                  {hotspot.emoji && (
                    <span className="text-2xl block mb-1">{hotspot.emoji}</span>
                  )}
                  <span
                    className={`text-sm font-semibold text-slate-700 ${
                      language === 'ar' ? 'font-cairo' : ''
                    }`}
                  >
                    {label}
                  </span>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-r border-b border-slate-200 rotate-45 -mt-1.5" />
                </div>
              )}
            </div>
          );
        })}

        {/* Completion overlay */}
        {completed && (
          <div className="absolute inset-0 flex items-center justify-center bg-emerald-50/70 rounded-2xl animate-[fadeIn_0.3s_ease-out]">
            <div className="text-center animate-[bounceIn_0.5s_ease-out]">
              <span className="text-4xl block">&#10003;</span>
              <p className="text-base font-bold text-emerald-700 mt-1">
                {language === 'ar' ? '!أحسنت' : 'Well done!'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Instruction */}
      {!completed && (
        <p className={`text-sm text-slate-500 text-center ${language === 'ar' ? 'font-cairo' : ''}`}>
          {language === 'ar'
            ? '👆 اضغط على النقاط المضيئة لاكتشاف ما تمثله'
            : '👆 Tap the glowing dots to discover what they represent'}
        </p>
      )}

      <style jsx>{`
        @keyframes ringPulse {
          0% { transform: scale(1); opacity: 0.7; }
          50% { transform: scale(1.4); opacity: 0; }
          100% { transform: scale(1); opacity: 0.7; }
        }
        @keyframes revealPop {
          0% { transform: scale(0); }
          70% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
        @keyframes tooltipReveal {
          0% { opacity: 0; transform: translate(-50%, 4px) scale(0.95); }
          100% { opacity: 1; transform: translate(-50%, 0) scale(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes bounceIn {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
