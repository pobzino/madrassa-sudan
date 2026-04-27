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
import VideoTimeline, { type TimelineCheckpointMarker } from './VideoTimeline';
import { packClipSegments, useSimClipEditor } from '@/lib/sim-clip-editor';
import { compactSimEvents, type SimEvent, type SimPayload, type SimRow } from '@/lib/sim.types';
import type { SimRecording } from '@/hooks/useSimRecorder';
import type { Slide } from '@/lib/slides.types';

export type SimReviewModalProps =
  | {
      mode: 'record-review';
      lessonId: string;
      language: 'ar' | 'en';
      recording: SimRecording;
      deckSnapshot: Slide[];
      onDiscard: () => void;
      onRetake: () => void;
      onSaved: (payload: SimPayload) => void;
    }
  | {
      mode: 'edit';
      lessonId: string;
      language: 'ar' | 'en';
      payload: SimPayload;
      onClose: () => void;
      onSaved: (updated: SimPayload) => void;
      onDeleted: () => void;
    }
  | {
      mode: 'view';
      lessonId: string;
      language: 'ar' | 'en';
      payload: SimPayload;
      onClose: () => void;
    };

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type CheckpointEvent =
  | Extract<SimEvent, { type: 'activity_gate' }>
  | Extract<SimEvent, { type: 'exploration_gate' }>;

type CheckpointTimes = Record<string, number>;

interface SimAudioUploadInstructions {
  sim_id: string;
  bucket: string;
  path: string;
  token: string;
  signed_url: string;
  content_type: string;
}

const CHECKPOINT_EPSILON_SEC = 0.05;
const EMPTY_EVENTS: SimEvent[] = [];

async function readErrorText(response: Response): Promise<string> {
  const body = await response.text().catch(() => '');
  return body.trim().slice(0, 300);
}

async function uploadAudioBlobToSignedUrl(
  instructions: SimAudioUploadInstructions,
  audioBlob: Blob
): Promise<void> {
  const body = new FormData();
  body.append('cacheControl', '3600');
  body.append(
    '',
    audioBlob,
    instructions.content_type.includes('mp4') ? 'recording.mp4' : 'recording.webm'
  );

  const headers = new Headers({ 'x-upsert': 'true' });
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (anonKey) {
    headers.set('apikey', anonKey);
  }

  const response = await fetch(instructions.signed_url, {
    method: 'PUT',
    headers,
    body,
  });

  if (!response.ok) {
    const details = await readErrorText(response);
    throw new Error(
      details
        ? `Audio upload failed (${response.status}): ${details}`
        : `Audio upload failed (${response.status})`
    );
  }
}

function isCheckpointEvent(event: SimEvent): event is CheckpointEvent {
  return event.type === 'activity_gate' || event.type === 'exploration_gate';
}

function checkpointId(index: number): string {
  return `checkpoint-${index}`;
}

function getCheckpointTimes(events: SimEvent[]): CheckpointTimes {
  const times: CheckpointTimes = {};
  let checkpointIndex = 0;
  for (const event of events) {
    if (!isCheckpointEvent(event)) continue;
    times[checkpointId(checkpointIndex)] = event.t / 1000;
    checkpointIndex += 1;
  }
  return times;
}

function checkpointTimesChanged(
  sourceTimes: CheckpointTimes,
  editedTimes: CheckpointTimes
): boolean {
  return Object.entries(sourceTimes).some(([id, sourceTime]) => {
    const editedTime = editedTimes[id] ?? sourceTime;
    return Math.abs(editedTime - sourceTime) > CHECKPOINT_EPSILON_SEC;
  });
}

function applyCheckpointTimes(
  events: SimEvent[],
  checkpointTimes: CheckpointTimes
): SimEvent[] {
  let checkpointIndex = 0;
  const patched = events.map((event, originalIndex) => {
    if (!isCheckpointEvent(event)) {
      return { event, originalIndex };
    }
    const nextTime = checkpointTimes[checkpointId(checkpointIndex)];
    checkpointIndex += 1;
    if (typeof nextTime !== 'number') {
      return { event, originalIndex };
    }
    return {
      event: {
        ...event,
        t: Math.max(0, Math.round(nextTime * 1000)),
      } as SimEvent,
      originalIndex,
    };
  });

  return patched
    .slice()
    .sort((a, b) => a.event.t - b.event.t || a.originalIndex - b.originalIndex)
    .map(({ event }) => event);
}

function getSlideTitle(slide: Slide | undefined, language: 'ar' | 'en'): string {
  if (!slide) return '';
  const primary = language === 'ar' ? slide.title_ar : slide.title_en;
  const fallback = language === 'ar' ? slide.title_en : slide.title_ar;
  return primary?.trim() || fallback?.trim() || `Slide ${slide.sequence + 1}`;
}

function getCheckpointMarkers(
  sourceEvents: SimEvent[],
  deck: Slide[],
  language: 'ar' | 'en',
  sourceTimes: CheckpointTimes,
  editedTimes: CheckpointTimes
): TimelineCheckpointMarker[] {
  const markers: TimelineCheckpointMarker[] = [];
  let checkpointIndex = 0;
  for (const event of sourceEvents) {
    if (!isCheckpointEvent(event)) continue;
    const id = checkpointId(checkpointIndex);
    const sourceTime = sourceTimes[id] ?? event.t / 1000;
    const time = editedTimes[id] ?? sourceTime;
    const slide = deck.find((candidate) => candidate.id === event.slide_id);
    const prefix = event.type === 'exploration_gate' ? 'Exploration checkpoint' : 'Activity checkpoint';
    markers.push({
      id,
      time,
      kind: event.type,
      label: `${prefix} ${checkpointIndex + 1}${slide ? `: ${getSlideTitle(slide, language)}` : ''}`,
      changed: Math.abs(time - sourceTime) > CHECKPOINT_EPSILON_SEC,
    });
    checkpointIndex += 1;
  }
  return markers;
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

  const recordReviewRecording =
    props.mode === 'record-review' ? props.recording : null;
  const recordReviewDeckSnapshot =
    props.mode === 'record-review' ? props.deckSnapshot : null;
  const existingPayload = props.mode !== 'record-review' ? props.payload : null;
  const recordReviewEvents = recordReviewRecording?.events ?? null;
  const existingEvents = existingPayload?.sim.events ?? null;
  const sourceEvents = recordReviewEvents ?? existingEvents ?? EMPTY_EVENTS;

  const sourceCheckpointTimes = useMemo(
    () => getCheckpointTimes(sourceEvents),
    [sourceEvents]
  );
  const [checkpointTimes, setCheckpointTimes] = useState<CheckpointTimes>(() =>
    getCheckpointTimes(sourceEvents)
  );

  useEffect(() => {
    setCheckpointTimes(getCheckpointTimes(sourceEvents));
  }, [sourceEvents]);

  const editableEvents = useMemo(
    () => applyCheckpointTimes(sourceEvents, checkpointTimes),
    [sourceEvents, checkpointTimes]
  );
  const hasCheckpointEdits = useMemo(
    () => checkpointTimesChanged(sourceCheckpointTimes, checkpointTimes),
    [sourceCheckpointTimes, checkpointTimes]
  );

  const previewPayload: SimPayload = useMemo(() => {
    if (recordReviewRecording && recordReviewDeckSnapshot) {
      // Stable ISO timestamp per (recording, lessonId) — regenerating on
      // every render would invalidate downstream memos in SimPlayer.
      const now = new Date(0).toISOString();
      const sim: SimRow = {
        id: 'preview',
        lesson_id: props.lessonId,
        duration_ms: recordReviewRecording.durationMs,
        deck_snapshot: recordReviewDeckSnapshot,
        events: editableEvents,
        audio_path: null,
        audio_duration_ms: recordReviewRecording.durationMs,
        audio_mime: recordReviewRecording.audioMime,
        recorded_by: null,
        recorded_at: now,
        clip_segments: null,
        created_at: now,
        updated_at: now,
      };
      return { sim, audio_url: blobUrl };
    }
    if (!existingPayload) {
      throw new Error('Sim payload missing');
    }
    return {
      ...existingPayload,
      sim: {
        ...existingPayload.sim,
        events: editableEvents,
      },
    };
  }, [
    recordReviewRecording,
    recordReviewDeckSnapshot,
    existingPayload,
    props.lessonId,
    blobUrl,
    editableEvents,
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
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

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
  const hasAnyEdits = editor.hasEdits || hasCheckpointEdits;

  const checkpointMarkers = useMemo(
    () =>
      getCheckpointMarkers(
        sourceEvents,
        sim.deck_snapshot,
        props.language,
        sourceCheckpointTimes,
        checkpointTimes
      ),
    [sourceEvents, sim.deck_snapshot, props.language, sourceCheckpointTimes, checkpointTimes]
  );

  const handleCheckpointMove = useCallback((id: string, time: number) => {
    setCheckpointTimes((prev) => {
      const nextTime = Math.max(0, Number(time.toFixed(2)));
      if (prev[id] === nextTime) return prev;
      return { ...prev, [id]: nextTime };
    });
  }, []);

  const handleResetAll = useCallback(() => {
    editor.reset();
    setCheckpointTimes(getCheckpointTimes(sourceEvents));
  }, [editor, sourceEvents]);

  // ── Save handlers per mode ──────────────────────────────────────────────

  const handleSaveRecord = useCallback(async () => {
    if (props.mode !== 'record-review') return;
    setSaving(true);
    setSaveError(null);
    setUploadProgress(0);
    try {
      const audioBlob = props.recording.audioBlob;
      let audioUpload: SimAudioUploadInstructions | null = null;

      if (audioBlob) {
        const prepareRes = await fetch(
          `/api/teacher/lessons/${props.lessonId}/sims/audio-upload`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              audio_mime: props.recording.audioMime,
              size_bytes: audioBlob.size,
            }),
          }
        );

        if (!prepareRes.ok) {
          const body = (await prepareRes.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || `Save failed (${prepareRes.status})`);
        }

        audioUpload = (await prepareRes.json()) as SimAudioUploadInstructions;
        setUploadProgress(15);

        await uploadAudioBlobToSignedUrl(audioUpload, audioBlob);
        setUploadProgress(75);
      }

      const createRes = await fetch(`/api/teacher/lessons/${props.lessonId}/sims`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: audioUpload?.sim_id,
          deck_snapshot: props.deckSnapshot,
          events: compactSimEvents(editableEvents),
          duration_ms: props.recording.durationMs,
          audio_duration_ms: props.recording.durationMs,
          audio_mime: audioUpload?.content_type ?? props.recording.audioMime,
          audio_upload_path: audioUpload?.path,
          audio_base64: null,
          clip_segments: previewClips.length > 0 ? previewClips : null,
        }),
      });

      if (!createRes.ok) {
        const body = (await createRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `Save failed (${createRes.status})`);
      }

      const saved = (await createRes.json()) as SimPayload;
      setUploadProgress(100);
      props.onSaved(saved);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      setSaveError(
        `${message}. The recording is still kept in this browser; try Save again, or refresh and restore it.`
      );
    } finally {
      setSaving(false);
      setUploadProgress(null);
    }
  }, [props, previewClips, editableEvents]);

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
            events: hasCheckpointEdits ? compactSimEvents(editableEvents) : undefined,
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
  }, [props, previewClips, hasCheckpointEdits, editableEvents]);

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
            language={props.language}
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

            {!isReadOnly && hasAnyEdits && (
              <button
                type="button"
                onClick={handleResetAll}
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
            checkpointMarkers={checkpointMarkers}
            onSeek={handleTimelineSeek}
            onTrimStartChange={isReadOnly ? () => {} : editor.setTrimStart}
            onTrimEndChange={isReadOnly ? () => {} : editor.setTrimEnd}
            onCutRegionUpdate={isReadOnly ? () => {} : editor.updateCutRegion}
            onCutRegionRemove={isReadOnly ? () => {} : editor.removeCutRegion}
            onCheckpointMove={isReadOnly ? undefined : handleCheckpointMove}
          />

          {checkpointMarkers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
              <span className="font-semibold text-gray-600">Checkpoints:</span>
              {checkpointMarkers.map((marker) => (
                <span
                  key={marker.id}
                  className={`rounded-full border px-2 py-0.5 ${
                    marker.changed
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  {formatDuration(marker.time)}
                </span>
              ))}
            </div>
          )}

          {!isReadOnly && (
            <p className="text-[11px] text-gray-400 leading-tight">
              Press play to watch. Drag amber handles to trim start/end. Click
              &quot;Cut&quot; to remove a section at the playhead, then drag its red
              edges to adjust. Drag blue or violet checkpoint pins to move
              interaction pauses.
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
              {saving
                ? uploadProgress !== null && uploadProgress < 100
                  ? `Uploading ${uploadProgress}%`
                  : 'Saving…'
                : 'Save to Lesson'}
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
                disabled={saving || !hasAnyEdits}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-1.5"
                title={hasAnyEdits ? 'Save sim edits' : 'No edits to save'}
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
