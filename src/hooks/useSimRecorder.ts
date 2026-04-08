'use client';

/**
 * Audio + event-log recorder for sims.
 *
 * Shape mirrors `useSlideRecorder` so the SlideEditor present-mode UI can
 * drop it in behind a feature flag, but the output is totally different:
 *
 *   - Audio:   one compact opus/webm Blob (mic only)
 *   - Events:  SimEvent[] that the UI layer appends via `recordEvent`
 *
 * The recorder owns the timeline clock. Callers should not stamp `t` — they
 * pass bare events and we assign `t` based on the monotonic
 * `performance.now()` clock, excluding any paused ranges.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SimEvent, SimEventInput } from '@/lib/sim.types';

// ── IndexedDB crash-recovery helpers ─────────────────────────────────────
const IDB_NAME = 'sim-recovery';
const IDB_STORE = 'partials';
const IDB_KEY = 'current';

interface RecoveryData {
  events: SimEvent[];
  durationMs: number;
  savedAt: number;
}

function openRecoveryDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveRecoveryData(data: RecoveryData): Promise<void> {
  const db = await openRecoveryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(data, IDB_KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function loadRecoveryData(): Promise<RecoveryData | null> {
  try {
    const db = await openRecoveryDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => { db.close(); resolve((req.result as RecoveryData) ?? null); };
      req.onerror = () => { db.close(); resolve(null); };
    });
  } catch { return null; }
}

async function clearRecoveryData(): Promise<void> {
  try {
    const db = await openRecoveryDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(IDB_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    });
  } catch { /* ignore */ }
}

export type SimRecorderState =
  | 'idle'
  | 'preparing'
  | 'countdown'
  | 'recording'
  | 'paused'
  | 'stopped';

export interface SimRecording {
  events: SimEvent[];
  audioBlob: Blob | null;
  audioMime: string;
  durationMs: number;
}

export interface UseSimRecorderReturn {
  state: SimRecorderState;
  recordingDurationMs: number;
  countdownValue: number;
  errorMessage: string | null;
  recording: SimRecording | null;
  /** Mic input level 0-100. Updated ~15 Hz while recording. */
  audioLevel: number;
  /** Recovered events from a previous crashed session (events only, no audio). */
  recoveredEvents: SimEvent[] | null;
  /** Accept recovered events as a partial recording (no audio). */
  acceptRecovery: () => void;
  /** Discard recovered data. */
  dismissRecovery: () => void;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  cancelRecording: () => void;
  /** Append an event to the timeline, stamped with the current logical time. */
  recordEvent: (event: SimEventInput) => void;
  /** Read the current logical time in ms (paused ranges excluded). */
  getCurrentTimeMs: () => number;
}

function pickAudioMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      // ignore
    }
  }
  return null;
}

/** Maximum recording duration in milliseconds (45 minutes). */
export const SIM_MAX_DURATION_MS = 45 * 60 * 1000;

export function useSimRecorder(): UseSimRecorderReturn {
  const [state, setState] = useState<SimRecorderState>('idle');
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [countdownValue, setCountdownValue] = useState(3);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recording, setRecording] = useState<SimRecording | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [recoveredEvents, setRecoveredEvents] = useState<SimEvent[] | null>(null);
  const recoveryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check for recovery data on mount
  useEffect(() => {
    loadRecoveryData().then((data) => {
      if (data && data.events.length > 0) {
        // Only offer recovery if data is less than 24 hours old
        if (Date.now() - data.savedAt < 24 * 60 * 60 * 1000) {
          setRecoveredEvents(data.events);
        } else {
          clearRecoveryData();
        }
      }
    });
  }, []);

  const acceptRecovery = useCallback(() => {
    if (!recoveredEvents) return;
    const durationMs = recoveredEvents.length > 0
      ? recoveredEvents[recoveredEvents.length - 1].t
      : 0;
    setRecording({
      events: recoveredEvents,
      audioBlob: null,
      audioMime: 'audio/webm',
      durationMs,
    });
    setState('stopped');
    setRecoveredEvents(null);
    clearRecoveryData();
  }, [recoveredEvents]);

  const dismissRecovery = useCallback(() => {
    setRecoveredEvents(null);
    clearRecoveryData();
  }, []);

  // Timeline clock state. All refs so we can mutate without re-renders.
  const startedAtRef = useRef<number>(0);         // performance.now() when recording began
  const accumulatedPausedMsRef = useRef<number>(0); // total time spent paused
  const pauseStartedAtRef = useRef<number | null>(null);
  const eventsRef = useRef<SimEvent[]>([]);

  // Media state
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioMimeRef = useRef<string>('audio/webm');
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopRequestedRef = useRef(false);
  const stateRef = useRef<SimRecorderState>('idle');
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  stateRef.current = state;

  // ── Time helpers ──────────────────────────────────────────────────────────

  const getCurrentTimeMs = useCallback((): number => {
    if (stateRef.current === 'idle' || stateRef.current === 'preparing' || stateRef.current === 'countdown') {
      return 0;
    }
    if (stateRef.current === 'paused' && pauseStartedAtRef.current !== null) {
      return Math.max(
        0,
        pauseStartedAtRef.current - startedAtRef.current - accumulatedPausedMsRef.current
      );
    }
    return Math.max(
      0,
      performance.now() - startedAtRef.current - accumulatedPausedMsRef.current
    );
  }, []);

  // ── Event capture ─────────────────────────────────────────────────────────

  const recordEvent = useCallback(
    (event: SimEventInput) => {
      if (
        stateRef.current !== 'recording' &&
        stateRef.current !== 'paused'
      ) {
        return;
      }
      const t = Math.max(0, Math.round(getCurrentTimeMs()));
      eventsRef.current.push({ ...event, t } as SimEvent);
    },
    [getCurrentTimeMs]
  );

  // ── Cleanup ───────────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    if (levelIntervalRef.current) {
      clearInterval(levelIntervalRef.current);
      levelIntervalRef.current = null;
    }
    if (recoveryIntervalRef.current) {
      clearInterval(recoveryIntervalRef.current);
      recoveryIntervalRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch { /* ignore */ }
      audioContextRef.current = null;
      analyserRef.current = null;
    }
    mediaRecorderRef.current = null;
    stopRequestedRef.current = false;
    pauseStartedAtRef.current = null;
    setAudioLevel(0);
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // ── Start ─────────────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    setErrorMessage(null);
    setRecording(null);
    setRecordingDurationMs(0);
    eventsRef.current = [];
    audioChunksRef.current = [];
    accumulatedPausedMsRef.current = 0;
    pauseStartedAtRef.current = null;
    stopRequestedRef.current = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage('Your browser does not support microphone access.');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setErrorMessage('Your browser does not support MediaRecorder.');
      return;
    }

    setState('preparing');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      micStreamRef.current = stream;

      // Set up audio level metering via AnalyserNode
      try {
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        audioContextRef.current = ctx;
        analyserRef.current = analyser;
        const buf = new Uint8Array(analyser.frequencyBinCount);
        levelIntervalRef.current = setInterval(() => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i];
          const avg = sum / buf.length;
          setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
        }, 67); // ~15 Hz
      } catch {
        // Metering is optional — don't block recording
      }

      // Countdown 3-2-1 before arming the recorder
      setState('countdown');
      for (let i = 3; i >= 1; i--) {
        setCountdownValue(i);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      const preferredMime = pickAudioMimeType();
      let recorder: MediaRecorder;
      try {
        recorder = preferredMime
          ? new MediaRecorder(stream, { mimeType: preferredMime, audioBitsPerSecond: 96_000 })
          : new MediaRecorder(stream, { audioBitsPerSecond: 96_000 });
      } catch {
        recorder = new MediaRecorder(stream);
      }
      audioMimeRef.current = recorder.mimeType || preferredMime || 'audio/webm';

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        cleanup();
        setState('idle');
        setErrorMessage('Recording failed in the browser. Please try again.');
      };

      recorder.onstop = () => {
        // Some browsers flush the last chunk slightly after stop fires.
        setTimeout(() => {
          const mime = audioMimeRef.current;
          const blob =
            audioChunksRef.current.length > 0
              ? new Blob(audioChunksRef.current, { type: mime })
              : null;
          const durationMs = Math.max(0, Math.round(getCurrentTimeMs()));

          setRecording({
            events: eventsRef.current.slice(),
            audioBlob: blob,
            audioMime: mime,
            durationMs,
          });
          setState('stopped');
          clearRecoveryData();

          if (recoveryIntervalRef.current) {
            clearInterval(recoveryIntervalRef.current);
            recoveryIntervalRef.current = null;
          }
          if (durationIntervalRef.current) {
            clearInterval(durationIntervalRef.current);
            durationIntervalRef.current = null;
          }
          if (micStreamRef.current) {
            micStreamRef.current.getTracks().forEach((track) => track.stop());
            micStreamRef.current = null;
          }
          mediaRecorderRef.current = null;
          stopRequestedRef.current = false;
        }, 200);
      };

      mediaRecorderRef.current = recorder;
      startedAtRef.current = performance.now();
      recorder.start(250);

      setState('recording');
      setRecoveredEvents(null);

      // Save events to IndexedDB every 10s for crash recovery
      recoveryIntervalRef.current = setInterval(() => {
        const events = eventsRef.current;
        if (events.length === 0) return;
        saveRecoveryData({
          events: events.slice(),
          durationMs: Math.round(getCurrentTimeMs()),
          savedAt: Date.now(),
        }).catch(() => { /* best-effort */ });
      }, 10_000);

      durationIntervalRef.current = setInterval(() => {
        const ms = Math.round(getCurrentTimeMs());
        setRecordingDurationMs(ms);
        // Auto-stop at max duration
        if (ms >= SIM_MAX_DURATION_MS && !stopRequestedRef.current) {
          const mr = mediaRecorderRef.current;
          if (mr && mr.state !== 'inactive') {
            stopRequestedRef.current = true;
            if (pauseStartedAtRef.current !== null) {
              accumulatedPausedMsRef.current += performance.now() - pauseStartedAtRef.current;
              pauseStartedAtRef.current = null;
            }
            try { mr.requestData(); } catch { /* ignore */ }
            setTimeout(() => {
              try { if (mr.state !== 'inactive') mr.stop(); } catch { stopRequestedRef.current = false; }
            }, 160);
          }
        }
      }, 200);
    } catch (error) {
      cleanup();
      setState('idle');
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setErrorMessage('Microphone permission was denied. Please allow access and try again.');
      } else {
        setErrorMessage(
          error instanceof Error ? error.message : 'Failed to start recording.'
        );
      }
    }
  }, [cleanup, getCurrentTimeMs]);

  // ── Pause / resume ────────────────────────────────────────────────────────

  const pauseRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    try {
      recorder.pause();
    } catch {
      // ignore
    }
    pauseStartedAtRef.current = performance.now();
    setState('paused');
  }, []);

  const resumeRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'paused') return;
    if (pauseStartedAtRef.current !== null) {
      accumulatedPausedMsRef.current += performance.now() - pauseStartedAtRef.current;
      pauseStartedAtRef.current = null;
    }
    try {
      recorder.resume();
    } catch {
      // ignore
    }
    setState('recording');
  }, []);

  // ── Stop ──────────────────────────────────────────────────────────────────

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive' || stopRequestedRef.current) {
      return;
    }
    stopRequestedRef.current = true;

    // If paused, close out the paused range so the duration is correct.
    if (pauseStartedAtRef.current !== null) {
      accumulatedPausedMsRef.current += performance.now() - pauseStartedAtRef.current;
      pauseStartedAtRef.current = null;
    }

    try {
      recorder.requestData();
    } catch {
      // ignore
    }

    setTimeout(() => {
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch {
        stopRequestedRef.current = false;
      }
    }, 160);
  }, []);

  // ── Cancel (discard) ──────────────────────────────────────────────────────

  const cancelRecording = useCallback(() => {
    cleanup();
    clearRecoveryData();
    eventsRef.current = [];
    audioChunksRef.current = [];
    accumulatedPausedMsRef.current = 0;
    pauseStartedAtRef.current = null;
    setRecording(null);
    setRecordingDurationMs(0);
    setState('idle');
  }, [cleanup]);

  return {
    state,
    recordingDurationMs,
    countdownValue,
    errorMessage,
    recording,
    audioLevel,
    recoveredEvents,
    acceptRecovery,
    dismissRecovery,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
    recordEvent,
    getCurrentTimeMs,
  };
}
