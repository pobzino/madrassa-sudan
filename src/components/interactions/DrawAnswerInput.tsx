'use client';

/**
 * Student-facing draw-answer widget. Reusable across every surface that
 * renders `InteractionRenderer` in answer mode — the slide canvas (editor,
 * present, sim replay) and the standalone `SlideInteractionOverlay` all share
 * this single implementation.
 *
 * Lifecycle
 * ---------
 * - `answer` + `disabled`: when both are set the widget renders the stored
 *   PNG as a flat image. This is the replay / read-only state used by
 *   SimPlayer and the overlay's post-submit view.
 * - Otherwise a live whiteboard is mounted. Every committed stroke is
 *   rasterized to a PNG data URL synchronously and emitted via
 *   `onAnswerChange` so the parent always has the current draft ready for
 *   grading. Perfect-freehand's in-progress stroke lives in a ref, so
 *   `strokes` only ticks on commit — no raster thrash during drawing.
 */

import { useEffect, useRef } from 'react';
import { useWhiteboard } from '@/hooks/useWhiteboard';
import WhiteboardCanvas from '@/components/slides/WhiteboardCanvas';
import type { InteractionAnswer } from '@/lib/interactions/types';

// Logical stroke space — must match WhiteboardCanvas (1280 × 720).
const DRAW_SOURCE_W = 1280;
const DRAW_SOURCE_H = 720;
// Rasterization target. Smaller buffer keeps the base64 payload manageable.
const DRAW_EXPORT_W = 768;
const DRAW_EXPORT_H = 432;
const DRAW_PEN_COLORS = ['#000000', '#DC2626', '#2563EB', '#16A34A'];

interface DrawAnswerInputProps {
  answer: Extract<InteractionAnswer, { type: 'draw_answer' }> | null;
  onAnswerChange?: (answer: InteractionAnswer) => void;
  disabled?: boolean;
  language: 'ar' | 'en';
}

export default function DrawAnswerInput({
  answer,
  onAnswerChange,
  disabled = false,
  language,
}: DrawAnswerInputProps) {
  const isAr = language === 'ar';
  const whiteboard = useWhiteboard();
  const { strokes, renderToCanvas } = whiteboard;
  const hasContent = strokes.length > 0;

  // Rasterize on every stroke commit. Perfect-freehand keeps in-progress
  // points in `currentStrokeRef`, so `strokes` only updates at stroke end —
  // one canvas allocation per committed stroke, not per pointer move.
  const onAnswerChangeRef = useRef(onAnswerChange);
  onAnswerChangeRef.current = onAnswerChange;
  useEffect(() => {
    if (disabled) return;
    const emit = onAnswerChangeRef.current;
    if (!emit) return;
    if (strokes.length === 0) {
      emit({ type: 'draw_answer', image_data_url: '' });
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = DRAW_EXPORT_W;
    canvas.height = DRAW_EXPORT_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, DRAW_EXPORT_W, DRAW_EXPORT_H);
    renderToCanvas(ctx, DRAW_EXPORT_W, DRAW_EXPORT_H, DRAW_SOURCE_W, DRAW_SOURCE_H);
    emit({
      type: 'draw_answer',
      image_data_url: canvas.toDataURL('image/png'),
    });
  }, [strokes, renderToCanvas, disabled]);

  // Read-only: hydrate from the stored PNG. We can't round-trip a rasterized
  // image back into editable strokes, so replay is display-only. Always take
  // this branch when `disabled` is true — including before any answer has
  // been projected — so sim replay never accidentally mounts the live
  // whiteboard under a locked state.
  if (disabled) {
    const dataUrl = answer?.image_data_url || '';
    return (
      <div className="overflow-hidden rounded-2xl border-2 border-gray-200 bg-white">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={dataUrl}
            alt=""
            className="block w-full h-auto"
            style={{ aspectRatio: `${DRAW_SOURCE_W} / ${DRAW_SOURCE_H}` }}
          />
        ) : (
          <div
            className="block w-full"
            style={{ aspectRatio: `${DRAW_SOURCE_W} / ${DRAW_SOURCE_H}` }}
          />
        )}
      </div>
    );
  }

  const currentTool = whiteboard.settings.tool;
  const currentColor = whiteboard.settings.color;
  const t = isAr
    ? { pen: 'قلم', eraser: 'ممحاة', undo: 'تراجع', clear: 'مسح' }
    : { pen: 'Pen', eraser: 'Eraser', undo: 'Undo', clear: 'Clear' };

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border-2 border-gray-200 bg-white">
        <div
          className="relative w-full"
          style={{ aspectRatio: `${DRAW_SOURCE_W} / ${DRAW_SOURCE_H}` }}
        >
          <WhiteboardCanvas whiteboard={whiteboard} active={!disabled} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => whiteboard.setTool('pen')}
          disabled={disabled}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
            currentTool === 'pen'
              ? 'border-[#007229] bg-[#007229]/10 text-[#007229]'
              : 'border-gray-200 bg-white text-gray-600 hover:border-[#007229]/40'
          }`}
        >
          {t.pen}
        </button>
        <button
          type="button"
          onClick={() => whiteboard.setTool('eraser')}
          disabled={disabled}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
            currentTool === 'eraser'
              ? 'border-amber-500 bg-amber-100 text-amber-700'
              : 'border-gray-200 bg-white text-gray-600 hover:border-amber-400'
          }`}
        >
          {t.eraser}
        </button>
        <div className="flex items-center gap-1">
          {DRAW_PEN_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => {
                whiteboard.setTool('pen');
                whiteboard.setColor(color);
              }}
              disabled={disabled}
              aria-label={color}
              className={`h-7 w-7 rounded-full border-2 transition-transform ${
                currentTool === 'pen' && currentColor === color
                  ? 'scale-110 border-gray-900'
                  : 'border-gray-200'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => whiteboard.undo()}
          disabled={disabled || !hasContent}
          className="ml-auto rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-[#007229]/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t.undo}
        </button>
        <button
          type="button"
          onClick={() => whiteboard.clear()}
          disabled={disabled || !hasContent}
          className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-rose-400 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t.clear}
        </button>
      </div>
    </div>
  );
}
