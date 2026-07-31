'use client';

/**
 * "Fix a mistake" panel for a saved sim: lists the slides in the order they
 * were narrated, with the stretch of the recording each one occupies, and
 * offers to re-record just that stretch. Replaces the old workflow of
 * re-recording the whole lesson because of one fumble.
 *
 * Shown in SimReviewModal's edit mode (draft lessons only — a published lesson
 * has to be unpublished before its recording can be touched).
 */

import { useMemo } from 'react';
import { computeSlideSpans } from '@/lib/sim-splice';
import AudioSpanPlayer from '@/components/slides/AudioSpanPlayer';
import type { SimPatchTarget } from '@/components/slides/sim-patch.types';
import type { SimEvent } from '@/lib/sim.types';
import type { Slide } from '@/lib/slides.types';

interface SimSlidePatchListProps {
  deck: Slide[];
  events: SimEvent[];
  durationMs: number;
  /** Signed URL of the current recording, so a tutor can hear a slide before replacing it. */
  audioUrl: string | null;
  language: 'ar' | 'en';
  onSelect: (target: SimPatchTarget) => void;
  disabled?: boolean;
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function slideLabel(slide: Slide | undefined, index: number, language: 'ar' | 'en'): string {
  if (!slide) return `Slide ${index + 1}`;
  const title = language === 'ar' ? slide.title_ar || slide.title_en : slide.title_en || slide.title_ar;
  return title?.trim() ? title.trim() : `Slide ${index + 1}`;
}

export default function SimSlidePatchList({
  deck,
  events,
  durationMs,
  audioUrl,
  language,
  onSelect,
  disabled = false,
}: SimSlidePatchListProps) {
  const targets = useMemo<SimPatchTarget[]>(() => {
    const spans = computeSlideSpans(events, durationMs, deck[0]?.id ?? null);
    return spans.map((span) => {
      const slideIndex = deck.findIndex((s) => s.id === span.slideId);
      const slide = slideIndex >= 0 ? deck[slideIndex] : undefined;
      const base = slideLabel(slide, slideIndex, language);
      return {
        ...span,
        slideIndex: slideIndex >= 0 ? slideIndex : 0,
        // A tutor who revisited a slide gets one row per visit.
        label: span.occurrence > 0 ? `${base} (visit ${span.occurrence + 1})` : base,
      };
    });
  }, [deck, events, durationMs, language]);

  if (targets.length === 0) {
    return (
      <p className="text-xs text-gray-500">
        This recording has no slide markers, so it can&apos;t be fixed slide by slide yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Fix a mistake</h3>
        <p className="mt-0.5 text-xs text-gray-500">
          Play a slide to hear what is there now, then re-record just that one. The rest of the
          recording is kept and everything after the fix shifts to fit.
        </p>
      </div>
      <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
        {targets.map((target) => (
          <li
            key={`${target.slideId}-${target.occurrence}`}
            className="flex items-center gap-3 bg-white px-3 py-2"
          >
            <span className="w-20 shrink-0 font-mono text-[11px] text-gray-400">
              {formatClock(target.startMs)}–{formatClock(target.endMs)}
            </span>
            <span className="flex-1 truncate text-sm text-gray-800" title={target.label}>
              {target.label}
            </span>
            <AudioSpanPlayer
              src={audioUrl}
              startMs={target.startMs}
              endMs={target.endMs}
              disabled={disabled}
              compact
              label={`Listen to ${target.label}`}
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(target)}
              className="shrink-0 rounded-lg border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-40"
            >
              Re-record
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
