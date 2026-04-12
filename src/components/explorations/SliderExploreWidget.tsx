'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExplorationWidgetProps, SliderExploreConfig, SliderExploreStage } from '@/lib/explorations/types';

function getActiveStage(
  value: number,
  stages: SliderExploreStage[]
): SliderExploreStage | null {
  const sorted = [...stages].sort((a, b) => b.threshold - a.threshold);
  for (const s of sorted) {
    if (value >= s.threshold) return s;
  }
  return null;
}

function stageIndex(stage: SliderExploreStage | null, stages: SliderExploreStage[]): number {
  if (!stage) return -1;
  return stages.findIndex(
    (s) => s.threshold === stage.threshold && s.label_en === stage.label_en
  );
}

export default function SliderExploreWidget({
  config,
  language,
  onComplete,
}: ExplorationWidgetProps<SliderExploreConfig>) {
  const { label_ar, label_en, min, max, step, initial, stages } = config;
  const [value, setValue] = useState(initial);
  const [visitedStages, setVisitedStages] = useState<Set<number>>(new Set());
  const [completed, setCompleted] = useState(false);
  const completedRef = useRef(false);

  const label = language === 'ar' ? label_ar : label_en;
  const currentStage = getActiveStage(value, stages);
  const currentIdx = stageIndex(currentStage, stages);

  // Track visited stages
  useEffect(() => {
    if (currentIdx < 0 || completedRef.current) return;
    setVisitedStages((prev) => {
      if (prev.has(currentIdx)) return prev;
      const next = new Set(prev);
      next.add(currentIdx);
      if (next.size >= 3 && !completedRef.current) {
        completedRef.current = true;
        setTimeout(() => {
          setCompleted(true);
          onComplete();
        }, 0);
      }
      return next;
    });
  }, [currentIdx, onComplete]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setValue(Number(e.target.value));
    },
    []
  );

  const stageColors = ['#3b82f6', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6', '#ec4899'];

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md mx-auto px-4 rounded-2xl bg-gradient-to-b from-sky-50/60 to-white py-6">
      {/* Label */}
      <h3
        className={`text-lg font-bold text-slate-700 ${language === 'ar' ? 'font-cairo' : ''}`}
      >
        {label}
      </h3>

      {/* Current stage display with crossfade */}
      <div className="flex flex-col items-center gap-1 min-h-[100px] justify-center relative">
        {currentStage && (
          <div
            key={currentIdx}
            className="flex flex-col items-center gap-1 animate-[stageFade_0.35s_ease-out]"
          >
            <span className="text-5xl" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}>
              {currentStage.emoji}
            </span>
            <span
              className={`text-lg font-semibold text-slate-700 ${language === 'ar' ? 'font-cairo' : ''}`}
            >
              {language === 'ar' ? currentStage.label_ar : currentStage.label_en}
            </span>
          </div>
        )}
        <span className="text-3xl font-bold tabular-nums text-slate-900">{value}</span>
      </div>

      {/* Slider with custom thumb */}
      <div className="w-full relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          disabled={completed}
          className="w-full h-4 rounded-full appearance-none cursor-pointer disabled:cursor-default slider-custom"
          style={{
            background: `linear-gradient(to right, ${
              stages
                .sort((a, b) => a.threshold - b.threshold)
                .map((s, i) => {
                  const pct = ((s.threshold - min) / (max - min)) * 100;
                  return `${stageColors[i % stageColors.length]} ${pct}%`;
                })
                .join(', ')
            })`,
          }}
        />
        <div className="flex justify-between mt-1">
          <span className="text-xs text-slate-400 font-medium">{min}</span>
          <span className="text-xs text-slate-400 font-medium">{max}</span>
        </div>
      </div>

      {/* Discovery tracker */}
      <div className="flex items-center gap-2">
        <span
          className={`text-xs text-slate-500 ${language === 'ar' ? 'font-cairo' : ''}`}
        >
          {language === 'ar' ? 'اكتشف:' : 'Discovered:'}
        </span>
        <div className="flex gap-2">
          {stages.map((s, i) => {
            const visited = visitedStages.has(i);
            return (
              <div
                key={i}
                className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all duration-300 ${
                  visited
                    ? 'bg-emerald-100 scale-110 shadow-sm'
                    : 'bg-slate-100 grayscale opacity-40'
                }`}
                title={language === 'ar' ? s.label_ar : s.label_en}
              >
                {s.emoji}
              </div>
            );
          })}
        </div>
        <span className="text-xs font-bold text-slate-500">
          {visitedStages.size}/{stages.length}
        </span>
      </div>

      {/* Completion celebration */}
      {completed && (
        <div className="flex flex-col items-center gap-1 animate-[bounceIn_0.5s_ease-out]">
          <span className="text-3xl animate-[scaleIn_0.4s_ease-out]">&#10003;</span>
          <p className="text-sm font-bold text-emerald-600">
            {language === 'ar' ? '!أحسنت' : 'Well done!'}
          </p>
        </div>
      )}

      {/* Instruction */}
      {!completed && (
        <p
          className={`text-sm text-slate-500 text-center ${language === 'ar' ? 'font-cairo' : ''}`}
        >
          {language === 'ar'
            ? '🔍 حرّك الشريط لاكتشاف ما يحدث عند القيم المختلفة'
            : '🔍 Move the slider to discover what happens at different values'}
        </p>
      )}

      <style jsx>{`
        @keyframes stageFade {
          0% { opacity: 0; transform: scale(0.9) translateY(6px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
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
        .slider-custom::-webkit-slider-thumb {
          appearance: none;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: white;
          border: 3px solid #3b82f6;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          cursor: pointer;
          transition: transform 0.15s;
        }
        .slider-custom::-webkit-slider-thumb:hover {
          transform: scale(1.15);
        }
        .slider-custom::-webkit-slider-thumb:active {
          transform: scale(1.05);
        }
      `}</style>
    </div>
  );
}
