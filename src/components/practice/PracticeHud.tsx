"use client";

import ProgressBar from "@/components/ui/ProgressBar";

// Top bar of the Practice player: progress track + hearts. Hearts reflect the
// mistake budget for passing (never a lockout — losing them all just means the
// retry screen at the end will suggest another go).

interface PracticeHudProps {
  current: number; // 0-based index of the current question
  total: number;
  hearts: number; // hearts remaining
  maxHearts: number;
  onExit?: () => void;
  exitLabel: string;
}

export default function PracticeHud({ current, total, hearts, maxHearts, onExit, exitLabel }: PracticeHudProps) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="flex items-center gap-3 sm:gap-4">
      {onExit && (
        <button
          type="button"
          onClick={onExit}
          aria-label={exitLabel}
          className="shrink-0 rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      <ProgressBar percent={pct} height="lg" className="flex-1" />

      <div className="flex shrink-0 items-center gap-1" aria-label={`${hearts}/${maxHearts}`}>
        {Array.from({ length: maxHearts }, (_, i) => {
          const filled = i < hearts;
          return (
            <svg
              key={i}
              viewBox="0 0 24 24"
              className={`h-6 w-6 transition-all duration-300 ${filled ? "scale-100 text-[var(--accent)]" : "scale-90 text-gray-200"}`}
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          );
        })}
      </div>
    </div>
  );
}
