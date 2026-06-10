'use client';

import { Fragment } from 'react';
import { OwlHead } from '@/components/illustrations';

interface HomeworkProgressBarProps {
  total: number;
  answered: number;
  current: number;
  onSelect: (index: number) => void;
  /** Per-question status for colouring steps */
  questionStatuses?: ('unanswered' | 'answered' | 'correct' | 'incorrect')[];
}

const CheckIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);
const XIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

export default function HomeworkProgressBar({
  total,
  current,
  onSelect,
  questionStatuses,
}: HomeworkProgressBarProps) {
  const statusOf = (idx: number) => questionStatuses?.[idx] ?? 'unanswered';

  // The furthest step the learner has reached (answered/graded or the current one).
  let reached = current;
  for (let i = 0; i < total; i++) {
    if (statusOf(i) !== 'unanswered') reached = Math.max(reached, i);
  }

  return (
    <div className="mb-6 pt-9">
      <div className="flex items-center px-1">
        {Array.from({ length: total }, (_, idx) => {
          const status = statusOf(idx);
          const isCurrent = idx === current;
          const correct = status === 'correct';
          const incorrect = status === 'incorrect';
          const done = status === 'answered' || correct;

          const circle = incorrect
            ? 'bg-red-500 border-red-600 text-white'
            : correct || done
              ? 'bg-emerald-500 border-emerald-600 text-white'
              : isCurrent
                ? 'bg-white border-emerald-500 text-emerald-700'
                : 'bg-white border-gray-200 text-gray-400';

          return (
            <Fragment key={idx}>
              {idx > 0 && (
                <div
                  className={`flex-1 h-1.5 rounded-full mx-1.5 transition-colors duration-500 ${
                    reached >= idx ? 'bg-emerald-500' : 'bg-gray-100'
                  }`}
                />
              )}
              <div className="relative shrink-0">
                {isCurrent && (
                  <div className="absolute left-1/2 -translate-x-1/2 -top-9 animate-bounce pointer-events-none">
                    <div className="w-8 h-8 rounded-full bg-white shadow-md border-2 border-emerald-400 flex items-center justify-center">
                      <OwlHead className="w-5 h-5" />
                    </div>
                  </div>
                )}
                <button
                  onClick={() => onSelect(idx)}
                  aria-label={`Question ${idx + 1}`}
                  className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold font-fredoka transition-all ${circle} ${
                    isCurrent ? 'ring-4 ring-emerald-500/20 scale-110' : ''
                  }`}
                >
                  {correct ? <CheckIcon /> : incorrect ? <XIcon /> : idx + 1}
                </button>
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
