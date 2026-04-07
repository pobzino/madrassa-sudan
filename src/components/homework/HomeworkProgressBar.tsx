'use client';

import { OwlHead } from '@/components/illustrations';

interface HomeworkProgressBarProps {
  total: number;
  answered: number;
  current: number;
  onSelect: (index: number) => void;
  /** Per-question status for coloring dots */
  questionStatuses?: ('unanswered' | 'answered' | 'correct' | 'incorrect')[];
}

export default function HomeworkProgressBar({
  total,
  answered,
  current,
  onSelect,
  questionStatuses,
}: HomeworkProgressBarProps) {
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
  // Position owl at current question position along the bar
  const owlPct = total > 1 ? (current / (total - 1)) * 100 : 50;

  return (
    <div className="mb-4 sm:mb-6">
      {/* Progress bar with walking owl */}
      <div className="relative h-7 sm:h-8 mb-2 sm:mb-3">
        {/* Track */}
        <div className="absolute top-1/2 -translate-y-1/2 left-3 right-3 sm:left-4 sm:right-4 h-2.5 sm:h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        {/* Owl icon walking along */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all duration-500 ease-out z-10"
          style={{ left: `clamp(1.25rem, calc(0.75rem + ${owlPct} * (100% - 1.5rem) / 100), calc(100% - 1.25rem))` }}
        >
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white shadow-md border-2 border-emerald-400 flex items-center justify-center">
            <OwlHead className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>
      </div>

      {/* Question dots */}
      <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-1 px-1 scrollbar-hide">
        {Array.from({ length: total }, (_, idx) => {
          const status = questionStatuses?.[idx] || 'unanswered';
          const isCurrent = idx === current;

          let dotClass = 'bg-gray-100 text-gray-500';
          if (status === 'answered') dotClass = 'bg-emerald-100 text-emerald-700';
          if (status === 'correct') dotClass = 'bg-emerald-100 text-emerald-700';
          if (status === 'incorrect') dotClass = 'bg-red-100 text-red-700';
          if (isCurrent) dotClass = 'bg-emerald-600 text-white shadow-lg scale-110';

          return (
            <button
              key={idx}
              onClick={() => onSelect(idx)}
              className={`flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold font-fredoka transition-all ${dotClass}`}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
