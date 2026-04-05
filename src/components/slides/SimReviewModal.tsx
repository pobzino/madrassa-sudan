'use client';

/**
 * SimReviewModal — unified review + edit + view surface for a lesson's sim.
 *
 * Replaces SimClipEditorModal / SimsListModal / the auto-upload-on-stop
 * flow. Drives three modes through a single discriminated-union prop:
 *
 *   record-review: teacher just hit Stop. Preview the raw recording (blob URL
 *                  audio), trim/cut with VideoTimeline, then POST to create
 *                  or replace the lesson's sim.
 *
 *   edit:          lesson is a draft and already has a sim. Round-trip the
 *                  stored clip_segments so the amber trim handles show at the
 *                  boundaries, let the teacher tweak, PATCH on save. Delete
 *                  button nukes the row + audio file.
 *
 *   view:          lesson is published, so the sim is locked. All editor
 *                  controls are disabled. Close is the only action.
 *
 * Preview uses the same <SimPlayer> students see, in `hideControls` mode,
 * driven by the imperative SimPlayerHandle. `SimPlayer` honors the live
 * `clipSegments` prop so the preview reflects edits in real time.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SimPlayer, { type SimPlayerHandle } from './SimPlayer';
import VideoTimeline from './VideoTimeline';
import { packClipSegments, useSimClipEditor } from '@/lib/sim-clip-editor';
import type { SimPayload, SimRow } from '@/lib/sim.types';
import type { SimRecording } from '@/hooks/useSimRecorder';
import type { Slide } from '@/lib/slides.types';

export type SimReviewModalProps =
  | {
      mode: 'record-review';
      lessonId: string;
      recording: SimRecording;
      deckSnapshot: Slide[];
      onDiscard: () => void;
      onRetake: () => void;
      onSaved: (payload: SimPayload) => void;
    }
  | {
      mode: 'edit';
      lessonId: string;
      payload: SimPayload;
      onClose: () => void;
      onSaved: (updated: SimPayload) => void;
      onDeleted: () => void;
    }
  | {
      mode: 'view';
      lessonId: string;
      payload: SimPayload;
      onClose: () => void;
    };

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

export default function SimReviewModal(props: SimReviewModalProps) {
  // ── Build the preview payload that drives <SimPlayer> ───────────────────
  //
  // In record-review mode we synthesize a SimPayload from the in-memory
  // SimRecording + the deck snapshot we captured at stop time. Audio is
  // served as a blob URL so we can preview before uploading — the URL is
  // created in a useEffect so cleanup is guaranteed. In edit/view modes the
  // payload already exists on the server.
  const recordingBlob =
    props.mode === 'record-review' ? props.recording.audioBlob : null;
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!recordingBlob) {
      setBlobUrl(null);
      return;
    }
    const url = URL.createObjectURL(recordingBlob);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [recordingBlob]);

  const previewPayload: SimPayload = useMemo(() => {
    if (props.mode === 'record-review') {
      // Stable ISO timestamp per (recording, lessonId) — regenerating on
      // every render would invalidate downstream memos in SimPlayer.
      const now = new Date(0).toISOString();
      const sim: SimRow = {
        id: 'preview',
        lesson_id: props.lessonId,
        duration_ms: props.recording.durationMs,
        deck_snapshot: props.deckSnapshot,
        events: props.recording.events,
        audio_path: null,
        audio_duration_ms: props.recording.durationMs,
        audio_mime: props.recording.audioMime,
        recorded_by: null,
        recorded_at: now,
        clip_segments: null,
        created_at: now,
        updated_at: now,
      };
      return { sim, audio_url: blobUrl };
    }
    return props.payload;
    // Edit/view modes are effectively static for the lifetime of the modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    props.mode,
    props.mode === 'record-review' ? props.recording : null,
    props.mode === 'record-review' ? props.deckSnapshot : null,
    props.mode !== 'record-review' ? props.payload : null,
    props.lessonId,
    blobUrl,
  ]);

  const { sim } = previewPayload;
  const durationSec = (sim.duration_ms || sim.audio_duration_ms || 0) / 1000;
  const initialClipSegments =
    props.mode === 'record-review' ? null : props.payload.sim.clip_segments;
  const editor = useSimClipEditor(durationSec, initialClipSegments);

  const playerRef = useRef<SimPlayerHandle>(null);
  // `currentTime` is the **real** audio time in seconds (un-clipped). The
  // VideoTimeline cursor and the Cut button both read it, and SimPlayer
  // pushes updates into it via `onRealTimeChange`.
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isReadOnly = props.mode === 'view';

  const togglePlayPause = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    if (p.isPlaying()) p.pause();
    else p.play();
  }, []);

  const handleTimelineSeek = useCallback((realSec: number) => {
    setCurrentTime(realSec);
    playerRef.current?.seekRealSec(realSec);
  }, []);

  const handleAddCut = useCallback(() => {
    editor.addCutRegion(currentTime);
  }, [editor, currentTime]);

  // Live preview clips — memoized so SimPlayer's internal useMemo deps only
  // invalidate when the actual ranges change.
  const previewClips = useMemo(
    () =>
      packClipSegments(
        {
          trimStart: editor.trimStart,
          trimEnd: editor.trimEnd,
          cutRegions: editor.cutRegions,
        },
        durationSec
      ),
    [editor.trimStart, editor.trimEnd, editor.cutRegions, durationSec]
  );

  // ── Save handlers per mode ──────────────────────────────────────────────

  const handleSaveRecord = useCallback(async () => {
    if (props.mode !== 'record-review') return;
    setSaving(true);
    setSaveError(null);
    try {
      const audioBase64 = props.recording.audioBlob
        ? await blobToBase64(props.recording.audioBlob)
        : null;
      const res = await fetch(
        `/api/teacher/lessons/${props.lessonId}/sims`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            deck_snapshot: props.deckSnapshot,
            events: props.recording.events,
            duration_ms: props.recording.durationMs,
            audio_duration_ms: props.recording.durationMs,
            audio_mime: props.recording.audioMime,
            audio_base64: audioBase64,
            clip_segments: previewClips.length > 0 ? previewClips : null,
          }),
        }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `Save failed (${res.status})`);
      }
      const saved = (await res.json()) as SimPayload;
      props.onSaved(saved);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [props, previewClips]);

  const handleSaveEdit = useCallback(async () => {
    if (props.mode !== 'edit') return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(
        `/api/teacher/lessons/${props.lessonId}/sims/${props.payload.sim.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            clip_segments: previewClips.length > 0 ? previewClips : null,
          }),
        }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `Save failed (${res.status})`);
      }
      const updated = (await res.json()) as SimPayload;
      props.onSaved(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [props, previewClips]);

  const handleDelete = useCallback(async () => {
    if (props.mode !== 'edit') return;
    if (!window.confirm('Delete this sim recording? This cannot be undone.')) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(
        `/api/teacher/lessons/${props.lessonId}/sims/${props.payload.sim.id}`,
        { method: 'DELETE', credentials: 'include' }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `Delete failed (${res.status})`);
      }
      props.onDeleted();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setSaving(false);
    }
  }, [props]);

  const handleBackdropClick = useCallback(() => {
    if (saving) return;
    if (props.mode === 'record-review') {
      // Backdrop click in record-review is ambiguous (discard? cancel?); keep
      // the modal open so the teacher has to pick Discard / Retake / Save
      // explicitly.
      return;
    }
    props.onClose();
  }, [saving, props]);

  const title =
    props.mode === 'record-review'
      ? 'Review Recording'
      : props.mode === 'edit'
      ? 'Edit Sim Recording'
      : 'Sim Recording';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <p className="text-xs text-gray-500">
              {props.mode === 'record-review' &&
                'Review the recording, trim or cut sections, then save to your lesson.'}
              {props.mode === 'edit' &&
                'Non-destructive edits — the original audio and events are preserved.'}
              {props.mode === 'view' &&
                'Lesson is published — sim is read-only. Unpublish to edit.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isReadOnly && (
              <span className="text-[10px] uppercase tracking-wide font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                Read-only
              </span>
            )}
            {props.mode !== 'record-review' && (
              <button
                type="button"
                onClick={props.onClose}
                className="w-8 h-8 rounded-full hover:bg-gray-100 grid place-items-center text-gray-500 hover:text-gray-700"
                aria-label="Close"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Live preview */}
        <div className="px-6 pt-6">
          <SimPlayer
            ref={playerRef}
            payload={previewPayload}
            language="en"
            clipSegments={previewClips}
            hideControls
            onRealTimeChange={setCurrentTime}
            onPlayStateChange={setIsPlaying}
          />
        </div>

        {/* Timeline + tools */}
        <div className="px-6 pt-4 pb-2 space-y-3">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={togglePlayPause}
              className="w-9 h-9 rounded-full bg-slate-900 text-white grid place-items-center hover:bg-slate-700 transition-colors"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>

            <button
              type="button"
              onClick={handleAddCut}
              disabled={isReadOnly}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              title="Mark a section to remove at the current playhead"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z"
                />
              </svg>
              Cut
            </button>

            {!isReadOnly && editor.hasEdits && (
              <button
                type="button"
                onClick={editor.reset}
                className="px-2.5 py-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Reset
              </button>
            )}

            <div className="flex-1" />

            <div className="text-xs text-gray-500">
              <span className="font-mono">
                {formatDuration(currentTime)} / {formatDuration(durationSec)}
              </span>
              {editor.hasEdits && (
                <>
                  <span className="mx-1 text-gray-300">→</span>
                  <span className="font-mono font-medium text-emerald-600">
                    {formatDuration(editor.keptDurationSec)}
                  </span>
                </>
              )}
            </div>
          </div>

          <VideoTimeline
            duration={durationSec}
            currentTime={currentTime}
            trimStart={editor.trimStart}
            trimEnd={editor.trimEnd}
            cutRegions={editor.cutRegions}
            onSeek={handleTimelineSeek}
            onTrimStartChange={isReadOnly ? () => {} : editor.setTrimStart}
            onTrimEndChange={isReadOnly ? () => {} : editor.setTrimEnd}
            onCutRegionUpdate={isReadOnly ? () => {} : editor.updateCutRegion}
            onCutRegionRemove={isReadOnly ? () => {} : editor.removeCutRegion}
          />

          {!isReadOnly && (
            <p className="text-[11px] text-gray-400 leading-tight">
              Press play to watch. Drag amber handles to trim start/end. Click
              &quot;Cut&quot; to remove a section at the playhead, then drag its red
              edges to adjust.
            </p>
          )}
        </div>

        {saveError && (
          <div className="mx-6 mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            {saveError}
          </div>
        )}

        {/* Footer — three layouts */}
        {props.mode === 'record-review' && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={props.onDiscard}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-60"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={props.onRetake}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-60"
            >
              Retake
            </button>
            <button
              type="button"
              onClick={handleSaveRecord}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {saving ? 'Saving…' : 'Save to Lesson'}
            </button>
          </div>
        )}

        {props.mode === 'edit' && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-red-700 border border-red-200 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-60"
            >
              Delete
            </button>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={props.onClose}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-60"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={saving || !editor.hasEdits}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-1.5"
                title={editor.hasEdits ? 'Save clip edits' : 'No edits to save'}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {props.mode === 'view' && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={props.onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
