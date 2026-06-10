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

type SimSaveAttemptStatus =
  | 'review_opened'
  | 'save_started'
  | 'audio_upload_preparing'
  | 'audio_upload_prepare_failed'
  | 'audio_upload_prepared'
  | 'audio_upload_failed'
  | 'audio_upload_succeeded'
  | 'finalize_started'
  | 'finalize_failed'
  | 'saved'
  | 'discarded'
  | 'retake'
  | 'abandoned'
  | 'failed';

interface SimSaveAttemptExtras {
  sim_id?: string | null;
  audio_path?: string | null;
  events_count?: number | null;
  error_message?: string | null;
  error_status?: number | null;
  error_details?: Record<string, unknown>;
}

const CHECKPOINT_EPSILON_SEC = 0.05;
const EMPTY_EVENTS: SimEvent[] = [];

async function readErrorText(response: Response): Promise<string> {
  const body = await response.text().catch(() => '');
  return body.trim().slice(0, 300);
}

const RETRY_BACKOFFS_MS = [1000, 3000, 6000];
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * fetch wrapper that retries the transient failures which used to lose long
 * recordings: network blips (fetch throws "Failed to fetch") and 5xx/429
 * responses. Non-retryable statuses (400/401/403/409/422) and successes are
 * returned immediately so the caller's own handling still runs. Every step in
 * the save flow is safe to retry — the audio PUT upserts the same path and the
 * finalize POST deletes-then-inserts under a UNIQUE(lesson_id) constraint.
 */
async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  retries = RETRY_BACKOFFS_MS.length
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(input, init);
      if (response.ok || !isRetryableStatus(response.status) || attempt >= retries) {
        return response;
      }
    } catch (error) {
      if (attempt >= retries) throw error;
    }
    await delay(RETRY_BACKOFFS_MS[Math.min(attempt, RETRY_BACKOFFS_MS.length - 1)]);
  }
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

  const response = await fetchWithRetry(instructions.signed_url, {
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

function assertAudioBlobCanBeSaved(audioBlob: Blob): void {
  if (audioBlob.size <= 0) {
    throw new Error('Recording audio is empty. Please retake the recording.');
  }
}

function makeAttemptId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `00000000-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`;
}

function getBrowserInfo(): Record<string, unknown> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {};
  }
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    online: navigator.onLine,
    visibilityState: document.visibilityState,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
  };
}

function stringByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function countEventsByType(events: SimEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) {
    counts[event.type] = (counts[event.type] ?? 0) + 1;
  }
  return counts;
}

function buildSaveDiagnostics(
  rawEvents: SimEvent[],
  compactEvents: SimEvent[],
  finalizePayloadBytes?: number
): Record<string, unknown> {
  const rawTypes = countEventsByType(rawEvents);
  const compactTypes = countEventsByType(compactEvents);
  return {
    raw_events_count: rawEvents.length,
    compact_events_count: compactEvents.length,
    dropped_events_count: Math.max(0, rawEvents.length - compactEvents.length),
    raw_stroke_point_count: rawTypes.stroke_point ?? 0,
    compact_stroke_point_count: compactTypes.stroke_point ?? 0,
    dropped_stroke_point_count: Math.max(
      0,
      (rawTypes.stroke_point ?? 0) - (compactTypes.stroke_point ?? 0)
    ),
    compact_event_types: compactTypes,
    ...(finalizePayloadBytes === undefined
      ? {}
      : { finalize_payload_bytes: finalizePayloadBytes }),
  };
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
  const saveAttemptIdRef = useRef<string | null>(null);
  const saveAttemptOpenedRef = useRef(false);
  const saveAttemptTerminalRef = useRef(false);

  const isReadOnly = props.mode === 'view';

  if (props.mode === 'record-review' && !saveAttemptIdRef.current) {
    saveAttemptIdRef.current = makeAttemptId();
  }
  const saveReference =
    props.mode === 'record-review' && saveAttemptIdRef.current
      ? saveAttemptIdRef.current.slice(0, 8)
      : null;

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

  const buildSaveAttemptBody = useCallback(
    (status: SimSaveAttemptStatus, extras: SimSaveAttemptExtras = {}) => {
      if (props.mode !== 'record-review' || !saveAttemptIdRef.current) return null;
      const audioBlob = props.recording.audioBlob;
      const eventsCount = extras.events_count ?? compactSimEvents(editableEvents).length;
      return {
        attempt_id: saveAttemptIdRef.current,
        status,
        sim_id: extras.sim_id,
        duration_ms: props.recording.durationMs,
        audio_duration_ms: props.recording.durationMs,
        audio_size_bytes: audioBlob?.size ?? null,
        audio_mime: props.recording.audioMime,
        audio_path: extras.audio_path,
        events_count: eventsCount,
        deck_slide_count: props.deckSnapshot.length,
        clip_segments_count: previewClips.length,
        error_message: extras.error_message,
        error_status: extras.error_status,
        error_details: extras.error_details,
        browser_info: getBrowserInfo(),
        runtime_version: process.env.NEXT_PUBLIC_RUNTIME_VERSION || 'dev',
        page_url: typeof window === 'undefined' ? null : window.location.href,
      };
    },
    [props, editableEvents, previewClips]
  );

  const trackSaveAttempt = useCallback(
    async (
      status: SimSaveAttemptStatus,
      extras: SimSaveAttemptExtras = {},
      options: { keepalive?: boolean } = {}
    ) => {
      if (props.mode !== 'record-review') return;
      const body = buildSaveAttemptBody(status, extras);
      if (!body) return;
      try {
        await fetch(`/api/teacher/lessons/${props.lessonId}/sims/save-attempts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          keepalive: options.keepalive,
          body: JSON.stringify(body),
        });
      } catch (error) {
        console.warn('Failed to track sim save attempt:', error);
      }
    },
    [props, buildSaveAttemptBody]
  );

  const sendSaveAttemptBeacon = useCallback(
    (status: SimSaveAttemptStatus, extras: SimSaveAttemptExtras = {}) => {
      if (props.mode !== 'record-review') return;
      const body = buildSaveAttemptBody(status, extras);
      if (!body) return;
      const json = JSON.stringify(body);
      const url = `/api/teacher/lessons/${props.lessonId}/sims/save-attempts`;
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const blob = new Blob([json], { type: 'application/json' });
        if (navigator.sendBeacon(url, blob)) return;
      }
      void fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        keepalive: true,
        body: json,
      }).catch(() => {});
    },
    [props, buildSaveAttemptBody]
  );

  useEffect(() => {
    if (props.mode !== 'record-review' || saveAttemptOpenedRef.current) return;
    saveAttemptOpenedRef.current = true;
    void trackSaveAttempt('review_opened');
  }, [props.mode, trackSaveAttempt]);

  useEffect(() => {
    if (props.mode !== 'record-review') return;
    const handlePageHide = () => {
      if (saveAttemptTerminalRef.current) return;
      sendSaveAttemptBeacon('abandoned');
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [props.mode, sendSaveAttemptBeacon]);

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
    let failureTracked = false;
    let compactEventCount: number | undefined;
    let saveDiagnostics: Record<string, unknown> | undefined;
    const buildAttemptDetails = (
      base: Record<string, unknown> | undefined,
      extra: Record<string, unknown> = {}
    ): Record<string, unknown> => ({
      ...(base ?? {}),
      ...extra,
    });
    try {
      const audioBlob = props.recording.audioBlob;
      let audioUpload: SimAudioUploadInstructions | null = null;
      const compactEvents = compactSimEvents(editableEvents);
      compactEventCount = compactEvents.length;
      saveDiagnostics = buildSaveDiagnostics(editableEvents, compactEvents);

      await trackSaveAttempt('save_started', {
        events_count: compactEventCount,
        error_details: saveDiagnostics,
      });

      if (!audioBlob) {
        const message = 'No recording audio was captured. Please retake the recording.';
        await trackSaveAttempt('failed', {
          events_count: compactEventCount,
          error_message: message,
          error_details: buildAttemptDetails(saveDiagnostics, {
            stage: 'audio_blob_validation',
            audio_size_bytes: null,
            audio_type: props.recording.audioMime,
          }),
        });
        failureTracked = true;
        throw new Error(message);
      }

      try {
        assertAudioBlobCanBeSaved(audioBlob);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Recording audio could not be verified';
        await trackSaveAttempt('failed', {
          events_count: compactEventCount,
          error_message: message,
          error_details: buildAttemptDetails(saveDiagnostics, {
            stage: 'audio_blob_validation',
            audio_size_bytes: audioBlob.size,
            audio_type: audioBlob.type || props.recording.audioMime,
          }),
        });
        failureTracked = true;
        throw error;
      }

      await trackSaveAttempt('audio_upload_preparing', {
        events_count: compactEventCount,
        error_details: buildAttemptDetails(saveDiagnostics, {
          audio_validation_strategy: 'server_probe',
        }),
      });
      const prepareRes = await fetchWithRetry(
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
        await trackSaveAttempt('audio_upload_prepare_failed', {
          events_count: compactEventCount,
          error_status: prepareRes.status,
          error_message: body?.error || `Save failed (${prepareRes.status})`,
          error_details: buildAttemptDetails(saveDiagnostics),
        });
        failureTracked = true;
        throw new Error(body?.error || `Save failed (${prepareRes.status})`);
      }

      audioUpload = (await prepareRes.json()) as SimAudioUploadInstructions;
      await trackSaveAttempt('audio_upload_prepared', {
        sim_id: audioUpload.sim_id,
        audio_path: audioUpload.path,
        events_count: compactEventCount,
        error_details: buildAttemptDetails(saveDiagnostics),
      });
      setUploadProgress(15);

      try {
        await uploadAudioBlobToSignedUrl(audioUpload, audioBlob);
        const validateRes = await fetchWithRetry(
          `/api/teacher/lessons/${props.lessonId}/sims/audio-upload?path=${encodeURIComponent(audioUpload.path)}`,
          { credentials: 'include', cache: 'no-store' }
        );
        const validation = (await validateRes.json().catch(() => null)) as {
          audio_url?: string;
          error?: string;
          probe?: unknown;
        } | null;

        if (!validateRes.ok || !validation?.audio_url) {
          throw new Error(
            validation?.error || `Uploaded audio validation failed (${validateRes.status})`
          );
        }
      } catch (error) {
        await trackSaveAttempt('audio_upload_failed', {
          sim_id: audioUpload.sim_id,
          audio_path: audioUpload.path,
          events_count: compactEventCount,
          error_message: error instanceof Error ? error.message : 'Audio upload failed',
          error_details: buildAttemptDetails(saveDiagnostics, {
            stage: 'post_upload_audio_validation',
          }),
        });
        failureTracked = true;
        throw error;
      }
      await trackSaveAttempt('audio_upload_succeeded', {
        sim_id: audioUpload.sim_id,
        audio_path: audioUpload.path,
        events_count: compactEventCount,
        error_details: buildAttemptDetails(saveDiagnostics),
      });
      setUploadProgress(75);

      const createPayload = {
        id: audioUpload?.sim_id,
        deck_snapshot: props.deckSnapshot,
        events: compactEvents,
        duration_ms: props.recording.durationMs,
        audio_duration_ms: props.recording.durationMs,
        audio_mime: audioUpload?.content_type ?? props.recording.audioMime,
        audio_upload_path: audioUpload?.path,
        audio_base64: null,
        clip_segments: previewClips.length > 0 ? previewClips : null,
      };
      const createBody = JSON.stringify(createPayload);
      const finalizeDiagnostics = buildSaveDiagnostics(
        editableEvents,
        compactEvents,
        stringByteLength(createBody)
      );
      await trackSaveAttempt('finalize_started', {
        sim_id: audioUpload?.sim_id,
        audio_path: audioUpload?.path,
        events_count: compactEventCount,
        error_details: buildAttemptDetails(finalizeDiagnostics),
      });
      const createRes = await fetchWithRetry(`/api/teacher/lessons/${props.lessonId}/sims`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: createBody,
      });

      if (!createRes.ok) {
        const body = (await createRes.json().catch(() => null)) as {
          error?: string;
          details?: unknown;
          request_stats?: unknown;
        } | null;
        await trackSaveAttempt('finalize_failed', {
          sim_id: audioUpload?.sim_id,
          audio_path: audioUpload?.path,
          events_count: compactEventCount,
          error_status: createRes.status,
          error_message: body?.error || `Save failed (${createRes.status})`,
          error_details: buildAttemptDetails(finalizeDiagnostics, {
            response_error: body?.error ?? null,
            response_details: body?.details ?? null,
            request_stats: body?.request_stats ?? null,
          }),
        });
        failureTracked = true;
        throw new Error(body?.error || `Save failed (${createRes.status})`);
      }

      const saved = (await createRes.json()) as SimPayload;
      await trackSaveAttempt('saved', {
        sim_id: saved.sim.id,
        audio_path: saved.sim.audio_path,
        events_count: compactEventCount,
        error_details: buildAttemptDetails(finalizeDiagnostics),
      });
      saveAttemptTerminalRef.current = true;
      setUploadProgress(100);
      props.onSaved(saved);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      if (!failureTracked) {
        await trackSaveAttempt('failed', {
          events_count: compactEventCount,
          error_message: message,
          error_details: buildAttemptDetails(saveDiagnostics),
        });
      }
      setSaveError(
        `${message}. The recording is still kept in this browser; try Save again, or refresh and restore it.`
      );
    } finally {
      setSaving(false);
      setUploadProgress(null);
    }
  }, [props, previewClips, editableEvents, trackSaveAttempt]);

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

  const handleDiscardRecord = useCallback(() => {
    if (props.mode !== 'record-review') return;
    saveAttemptTerminalRef.current = true;
    void trackSaveAttempt('discarded', {}, { keepalive: true });
    props.onDiscard();
  }, [props, trackSaveAttempt]);

  const handleRetakeRecord = useCallback(() => {
    if (props.mode !== 'record-review') return;
    saveAttemptTerminalRef.current = true;
    void trackSaveAttempt('retake', {}, { keepalive: true });
    props.onRetake();
  }, [props, trackSaveAttempt]);

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
            lessonId={props.lessonId}
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
          <div className="mx-6 mb-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <p className="font-semibold">Save did not complete</p>
                <p className="text-xs leading-relaxed text-red-700">{saveError}</p>
                <p className="text-xs leading-relaxed text-red-700">
                  Do not retake yet. This recording is still kept in this browser while this
                  review window is open.
                  {saveReference ? ` Reference: ${saveReference}` : ''}
                </p>
              </div>
              {props.mode === 'record-review' && (
                <button
                  type="button"
                  onClick={handleSaveRecord}
                  disabled={saving}
                  className="shrink-0 rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-red-300"
                >
                  {saving ? 'Retrying...' : 'Retry Save'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Footer — three layouts */}
        {props.mode === 'record-review' && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleDiscardRecord}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-60"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handleRetakeRecord}
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
