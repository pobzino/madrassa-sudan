'use client';

/**
 * Confirm-and-apply step after a tutor re-records one slide. Lets them hear the
 * new take before it is spliced into the saved recording, then runs the splice
 * (audio + timeline), uploads it and saves.
 *
 * Nothing is destructive until "Apply fix" succeeds: the original audio object
 * stays in storage, and discarding just throws the take away.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { applySimPatch } from '@/lib/sim-patch';
import type { SimPatchTarget } from '@/components/slides/sim-patch.types';
import type { SimPayload } from '@/lib/sim.types';
import type { SimRecording } from '@/hooks/useSimRecorder';

interface SimPatchDialogProps {
  lessonId: string;
  payload: SimPayload;
  target: SimPatchTarget;
  recording: SimRecording;
  onCancel: () => void;
  onApplied: () => void;
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function SimPatchDialog({
  lessonId,
  payload,
  target,
  recording,
  onCancel,
  onApplied,
}: SimPatchDialogProps) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const takeUrl = useMemo(() => {
    if (!recording.audioBlob) return null;
    const url = URL.createObjectURL(recording.audioBlob);
    audioUrlRef.current = url;
    return url;
  }, [recording.audioBlob]);

  useEffect(
    () => () => {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    },
    []
  );

  const originalSpanMs = target.endMs - target.startMs;
  const deltaMs = recording.durationMs - originalSpanMs;

  const apply = async () => {
    if (!recording.audioBlob) {
      setError('The new recording has no audio.');
      return;
    }
    if (!payload.audio_url) {
      setError('The original recording audio could not be found.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await applySimPatch({
        lessonId,
        simId: payload.sim.id,
        audioUrl: payload.audio_url,
        events: payload.sim.events,
        clipSegments: payload.sim.clip_segments,
        durationMs: payload.sim.duration_ms,
        replaceStartMs: target.startMs,
        replaceEndMs: target.endMs,
        slideId: target.slideId,
        take: {
          audioBlob: recording.audioBlob,
          events: recording.events,
          durationMs: recording.durationMs,
        },
        onProgress: (value, label) => {
          setProgress(value);
          setStage(label);
        },
      });
      toast.success(`Fix applied — lesson is now ${formatClock(result.durationMs)} long`);
      onApplied();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not apply the fix';
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-base font-bold text-gray-900">Replace this slide&apos;s recording?</h2>
        <p className="mt-1 text-sm text-gray-600">
          <span className="font-semibold">{target.label}</span> — replacing{' '}
          {formatClock(target.startMs)}–{formatClock(target.endMs)} of the lesson.
        </p>

        <dl className="mt-4 grid grid-cols-3 gap-3 rounded-xl bg-gray-50 p-3 text-center">
          <div>
            <dt className="text-[11px] font-medium text-gray-500">Was</dt>
            <dd className="text-sm font-bold text-gray-800">{formatClock(originalSpanMs)}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium text-gray-500">New take</dt>
            <dd className="text-sm font-bold text-gray-800">{formatClock(recording.durationMs)}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium text-gray-500">Lesson length</dt>
            <dd
              className={`text-sm font-bold ${deltaMs === 0 ? 'text-gray-800' : deltaMs > 0 ? 'text-amber-600' : 'text-emerald-600'}`}
            >
              {deltaMs === 0
                ? 'unchanged'
                : `${deltaMs > 0 ? '+' : '−'}${formatClock(Math.abs(deltaMs))}`}
            </dd>
          </div>
        </dl>

        {takeUrl && (
          <div className="mt-4">
            <p className="mb-1 text-xs font-medium text-gray-500">Listen back before applying</p>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio src={takeUrl} controls className="w-full" />
          </div>
        )}

        {busy && (
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-[var(--primary,#007229)] transition-[width] duration-300"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">{stage || 'Working'}…</p>
          </div>
        )}

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            Discard take
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={busy}
            className="rounded-xl bg-[var(--primary,#007229)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {busy ? 'Applying…' : 'Apply fix'}
          </button>
        </div>
      </div>
    </div>
  );
}
