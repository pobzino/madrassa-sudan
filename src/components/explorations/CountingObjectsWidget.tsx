'use client';

import { useCallback, useRef, useState } from 'react';
import type { ExplorationWidgetProps, CountingObjectsConfig } from '@/lib/explorations/types';

export default function CountingObjectsWidget({
  config,
  language,
  onComplete,
}: ExplorationWidgetProps<CountingObjectsConfig>) {
  const { objects, target_count } = config;
  const [tapOrder, setTapOrder] = useState<number[]>([]);
  const [completed, setCompleted] = useState(false);
  const completedRef = useRef(false);

  const tappedSet = new Set(tapOrder);

  const handleTap = useCallback(
    (index: number) => {
      if (completedRef.current) return;

      setTapOrder((prev) => {
        if (prev.includes(index)) {
          return prev.filter((i) => i !== index);
        }
        const next = [...prev, index];
        if (next.length === target_count) {
          completedRef.current = true;
          setCompleted(true);
          setTimeout(() => onComplete(), 600);
        }
        return next;
      });
    },
    [target_count, onComplete]
  );

  const handleReset = useCallback(() => {
    if (completedRef.current) return;
    setTapOrder([]);
  }, []);

  const getNumberForIndex = (index: number): number | null => {
    const pos = tapOrder.indexOf(index);
    return pos >= 0 ? pos + 1 : null;
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md mx-auto px-4 rounded-2xl bg-gradient-to-b from-green-50/60 to-white py-6">
      {/* Counter */}
      <div className="flex items-center gap-3">
        <div
          className={`text-4xl font-bold tabular-nums transition-all duration-300 ${
            completed ? 'text-emerald-500 scale-110' : 'text-blue-600'
          }`}
        >
          {tapOrder.length}
        </div>
        <span className="text-base text-slate-400 font-medium">/ {target_count}</span>
      </div>

      {/* Object canvas */}
      <div className="relative w-full aspect-[4/3] bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 overflow-hidden">
        {objects.map((obj, i) => {
          const isTapped = tappedSet.has(i);
          const num = getNumberForIndex(i);
          const size = Math.max(obj.size || 48, 48); // Ensure min 48px touch target
          const delay = i * 0.08;

          return (
            <button
              key={i}
              type="button"
              onClick={() => handleTap(i)}
              disabled={completed}
              className={`absolute flex items-center justify-center transition-all duration-200 rounded-full ${
                isTapped
                  ? 'scale-110 ring-3 ring-emerald-400 bg-emerald-50'
                  : 'bg-white shadow-md hover:shadow-lg hover:scale-105'
              }`}
              style={{
                left: `${obj.x_pct}%`,
                top: `${obj.y_pct}%`,
                width: size,
                height: size,
                minWidth: 48,
                minHeight: 48,
                transform: `translate(-50%, -50%) ${isTapped ? 'scale(1.1)' : ''}`,
                animation: !isTapped && !completed ? `bobIdle 3s ease-in-out ${delay}s infinite, bounceIn 0.4s ease-out ${delay}s both` : undefined,
              }}
            >
              <span className="text-2xl select-none">{obj.icon}</span>
              {num !== null && (
                <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center shadow animate-[tapPulse_0.3s_ease-out]">
                  {num}
                </span>
              )}
            </button>
          );
        })}

        {/* Completion overlay */}
        {completed && (
          <div className="absolute inset-0 flex items-center justify-center bg-emerald-50/80 rounded-2xl animate-[fadeIn_0.3s_ease-out]">
            <div className="text-center animate-[bounceIn_0.5s_ease-out]">
              <div className="text-5xl font-bold text-emerald-600">{tapOrder.length}</div>
              <span className="text-3xl block my-1">&#10003;</span>
              <p className="text-base text-emerald-700 font-bold">
                {language === 'ar' ? '!أحسنت' : 'Well done!'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        {!completed && (
          <>
            <p className="text-sm text-slate-500">
              {language === 'ar' ? '👆 اضغط على كل شيء لعدّه' : '👆 Tap each object to count it'}
            </p>
            {tapOrder.length > 0 && (
              <button
                type="button"
                onClick={handleReset}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 transition-colors min-h-[36px]"
              >
                {language === 'ar' ? 'إعادة' : 'Reset'}
              </button>
            )}
          </>
        )}
      </div>

      <style jsx>{`
        @keyframes bobIdle {
          0%, 100% { transform: translate(-50%, -50%); }
          50% { transform: translate(-50%, calc(-50% - 4px)); }
        }
        @keyframes bounceIn {
          0% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
          60% { transform: translate(-50%, -50%) scale(1.15); }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }
        @keyframes tapPulse {
          0% { transform: scale(0); }
          70% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
