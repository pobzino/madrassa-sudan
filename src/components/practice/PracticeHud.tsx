"use client";

import { Heart, X } from "lucide-react";
import ProgressBar from "@/components/ui/ProgressBar";

interface PracticeHudProps {
  title?: string;
  current: number;
  total: number;
  hearts: number;
  maxHearts: number;
  questionLabel: string;
  onExit?: () => void;
  exitLabel: string;
}

export default function PracticeHud({
  title,
  current,
  total,
  hearts,
  maxHearts,
  questionLabel,
  onExit,
  exitLabel,
}: PracticeHudProps) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <header className="space-y-3">
      <div className="flex min-h-10 items-center gap-3">
        {onExit && (
          <button
            type="button"
            onClick={onExit}
            aria-label={exitLabel}
            title={exitLabel}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-gray-400 transition-colors hover:bg-white hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        )}

        <div className="min-w-0 flex-1">
          {title && <p className="truncate text-sm font-bold text-gray-800 sm:text-base">{title}</p>}
          <p className="text-xs font-semibold text-gray-500">{questionLabel}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5" aria-label={`${hearts}/${maxHearts}`}>
          {Array.from({ length: maxHearts }, (_, i) => {
            const filled = i < hearts;
            return (
              <Heart
                key={i}
                aria-hidden="true"
                className={`h-5 w-5 transition-all duration-300 sm:h-6 sm:w-6 ${
                  filled ? "scale-100 fill-[#D21034] text-[#D21034]" : "scale-90 fill-gray-200 text-gray-200"
                }`}
              />
            );
          })}
        </div>
      </div>

      <ProgressBar
        percent={pct}
        height="md"
        className="bg-white shadow-inner"
        label={questionLabel}
      />
    </header>
  );
}
