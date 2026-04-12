'use client';

/**
 * Sim Lab — event-sourced lesson recording over a real slide deck.
 *
 * A "sim" is an audio track + a structured timeline of events that drive
 * a live, interactive slide deck. It replaces video files with a replayable
 * event log played against the real UI components.
 *
 * Data model
 *   Sim = {
 *     version:    schema version
 *     createdAt:  timestamp
 *     duration:   total recording length (ms)
 *     deck:       frozen snapshot of the slide deck at recording time
 *     events:     timeline of user actions, timestamped from t=0
 *     audio:      audio track (blob URL in memory, base64 in export)
 *   }
 *
 * Storage (production)
 *   table lesson_sims (
 *     id uuid pk,
 *     lesson_id uuid references lessons(id),
 *     teacher_id uuid references auth.users(id),
 *     deck_snapshot jsonb,   -- frozen deck, so edits don't break old sims
 *     events jsonb,          -- the timeline (typically 50KB-5MB)
 *     audio_path text,       -- key in Supabase Storage bucket 'sim-audio'
 *     duration_ms int,
 *     created_at timestamptz default now()
 *   );
 *   RLS: students see sims for lessons they're enrolled in.
 *   Storage: one 'sim-audio' bucket, files named <sim_id>.webm, streamed.
 *
 * Storage (this POC)
 *   Everything is bundled into a single downloadable .sim.json file.
 *   Audio is base64-inlined so the file is self-contained. Same shape
 *   the DB row would have, just inlined for demo purposes.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ── Types ──

interface Point {
  x: number;
  y: number;
}

interface StrokeData {
  id: string;
  color: string;
  width: number;
  points: Point[];
}

type SlideKind = 'title' | 'bullets' | 'diagram' | 'question';

interface ExampleSlide {
  id: string;
  kind: SlideKind;
  title: string;
  subtitle?: string;
  bullets?: string[];
  question?: string;
  answer?: string;
}

interface SlideSurface {
  strokes: StrokeData[];
  revealed: number;
  spotlight: { x: number; y: number } | null;
}

interface SurfaceState {
  currentSlideId: string;
  slides: Record<string, SlideSurface>;
}

type TimelineEvent =
  | { t: number; type: 'slide_change'; slideId: string }
  | { t: number; type: 'stroke_start'; slideId: string; id: string; color: string; width: number; point: Point }
  | { t: number; type: 'stroke_point'; slideId: string; id: string; point: Point }
  | { t: number; type: 'stroke_end'; slideId: string; id: string }
  | { t: number; type: 'reveal_bullet'; slideId: string; index: number }
  | { t: number; type: 'spotlight_on'; slideId: string; x: number; y: number }
  | { t: number; type: 'spotlight_move'; slideId: string; x: number; y: number }
  | { t: number; type: 'spotlight_off'; slideId: string }
  | { t: number; type: 'clear_strokes'; slideId: string };

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
type TimelineEventInput = DistributiveOmit<TimelineEvent, 't'>;

interface Sim {
  version: 1;
  createdAt: number;
  duration: number;
  deck: ExampleSlide[];
  events: TimelineEvent[];
  audioUrl: string | null; // object URL in memory
}

// Shape of the on-disk .sim.json file (audio inlined as base64)
interface SimFile {
  version: 1;
  createdAt: number;
  duration: number;
  deck: ExampleSlide[];
  events: TimelineEvent[];
  audio: string | null; // data URL
}

// ── Constants ──

const STAGE_W = 1280;
const STAGE_H = 720;

const EXAMPLE_DECK: ExampleSlide[] = [
  {
    id: 'intro',
    kind: 'title',
    title: 'Adding Fractions',
    subtitle: 'A visual introduction for curious minds',
  },
  {
    id: 'what',
    kind: 'bullets',
    title: 'What is a fraction?',
    bullets: [
      'A fraction has a top number — the numerator.',
      'And a bottom number — the denominator.',
      'It tells us "how many out of how many".',
    ],
  },
  {
    id: 'diagram',
    kind: 'diagram',
    title: 'Visualising  1⁄4 + 2⁄4',
    subtitle: 'Draw arrows to show how the pieces combine.',
  },
  {
    id: 'how',
    kind: 'bullets',
    title: 'How do we add them?',
    bullets: [
      'Same denominator? Add the numerators only.',
      'Keep the denominator the same.',
      'Then simplify if you can.',
    ],
  },
  {
    id: 'practice',
    kind: 'question',
    title: 'Your turn',
    question: '1⁄3  +  1⁄3  =  ?',
    answer: '2⁄3',
  },
];

// ── Reducer ──

function initialSlideSurface(): SlideSurface {
  return { strokes: [], revealed: 0, spotlight: null };
}

function initialSurface(deck: ExampleSlide[]): SurfaceState {
  const slides: Record<string, SlideSurface> = {};
  for (const s of deck) slides[s.id] = initialSlideSurface();
  return { currentSlideId: deck[0]?.id || '', slides };
}

function applySlideEvent(slide: SlideSurface, event: TimelineEvent): SlideSurface {
  switch (event.type) {
    case 'stroke_start':
      return {
        ...slide,
        strokes: [
          ...slide.strokes,
          { id: event.id, color: event.color, width: event.width, points: [event.point] },
        ],
      };
    case 'stroke_point': {
      const idx = slide.strokes.findIndex((s) => s.id === event.id);
      if (idx === -1) return slide;
      const next = slide.strokes.slice();
      next[idx] = { ...next[idx], points: [...next[idx].points, event.point] };
      return { ...slide, strokes: next };
    }
    case 'stroke_end':
      return slide;
    case 'reveal_bullet':
      return { ...slide, revealed: Math.max(slide.revealed, event.index + 1) };
    case 'spotlight_on':
    case 'spotlight_move':
      return { ...slide, spotlight: { x: event.x, y: event.y } };
    case 'spotlight_off':
      return { ...slide, spotlight: null };
    case 'clear_strokes':
      return { ...slide, strokes: [] };
    default:
      return slide;
  }
}

function applyEvent(state: SurfaceState, event: TimelineEvent): SurfaceState {
  if (event.type === 'slide_change') {
    return { ...state, currentSlideId: event.slideId };
  }
  const slideId = event.slideId;
  const prev = state.slides[slideId];
  if (!prev) return state;
  const next = applySlideEvent(prev, event);
  if (next === prev) return state;
  return { ...state, slides: { ...state.slides, [slideId]: next } };
}

function rebuildState(deck: ExampleSlide[], events: TimelineEvent[], upToMs: number): SurfaceState {
  let state = initialSurface(deck);
  for (const event of events) {
    if (event.t > upToMs) break;
    state = applyEvent(state, event);
  }
  return state;
}

// ── Helpers ──

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function pickMimeType(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return undefined;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function urlToBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  return res.blob();
}

// ── Page ──

type Mode = 'idle' | 'recording' | 'playing' | 'paused_interactive';

export default function SimLabPage() {
  const [deck, setDeck] = useState<ExampleSlide[]>(EXAMPLE_DECK);
  const [surface, setSurface] = useState<SurfaceState>(() => initialSurface(EXAMPLE_DECK));

  const [tool, setTool] = useState<'pen' | 'spotlight'>('pen');
  const [color, setColor] = useState<string>('#DC2626');

  const [mode, setMode] = useState<Mode>('idle');
  const [sim, setSim] = useState<Sim | null>(null);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showStorageInfo, setShowStorageInfo] = useState(false);
  const [logTick, setLogTick] = useState(0);

  const modeRef = useRef<Mode>(mode);
  modeRef.current = mode;
  const recordStartRef = useRef(0);
  const recordingEventsRef = useRef<TimelineEvent[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioElRef = useRef<HTMLAudioElement>(null);
  const playbackRafRef = useRef<number>(0);
  const lastAppliedTimeRef = useRef(0);
  const recordingTimerRef = useRef<number>(0);
  const drawingStrokeIdRef = useRef<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentSlide = useMemo(
    () => deck.find((s) => s.id === surface.currentSlideId) || deck[0],
    [deck, surface.currentSlideId]
  );
  const currentSurface = surface.slides[surface.currentSlideId] || initialSlideSurface();

  const isInteractive =
    mode === 'idle' || mode === 'recording' || mode === 'paused_interactive';

  // ── Cleanup ──
  useEffect(() => {
    return () => {
      if (playbackRafRef.current) cancelAnimationFrame(playbackRafRef.current);
      if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // ── Event emission ──
  const pushEvent = useCallback((event: TimelineEventInput) => {
    if (modeRef.current !== 'recording') return;
    const t = performance.now() - recordStartRef.current;
    recordingEventsRef.current.push({ ...event, t } as TimelineEvent);
  }, []);

  // ── Coord conversion ──
  const getStagePoint = useCallback((e: React.PointerEvent): Point => {
    const stage = stageRef.current;
    if (!stage) return { x: 0, y: 0 };
    const rect = stage.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * STAGE_W,
      y: ((e.clientY - rect.top) / rect.height) * STAGE_H,
    };
  }, []);

  // ── Surface mutators (local + event) ──
  const mutateCurrentSlide = useCallback(
    (fn: (s: SlideSurface) => SlideSurface) => {
      setSurface((state) => {
        const prev = state.slides[state.currentSlideId] || initialSlideSurface();
        const next = fn(prev);
        if (next === prev) return state;
        return { ...state, slides: { ...state.slides, [state.currentSlideId]: next } };
      });
    },
    []
  );

  // ── Drawing ──
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isInteractive) return;
      e.preventDefault();
      try {
        (e.target as Element).setPointerCapture(e.pointerId);
      } catch {}
      const point = getStagePoint(e);
      const slideId = surface.currentSlideId;

      if (tool === 'spotlight') {
        mutateCurrentSlide((s) => ({ ...s, spotlight: point }));
        pushEvent({ type: 'spotlight_on', slideId, x: point.x, y: point.y });
        return;
      }

      const id = `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      drawingStrokeIdRef.current = id;
      mutateCurrentSlide((s) => ({
        ...s,
        strokes: [...s.strokes, { id, color, width: 4, points: [point] }],
      }));
      pushEvent({ type: 'stroke_start', slideId, id, color, width: 4, point });
    },
    [isInteractive, tool, color, surface.currentSlideId, getStagePoint, mutateCurrentSlide, pushEvent]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isInteractive) return;
      const point = getStagePoint(e);
      const slideId = surface.currentSlideId;

      if (tool === 'spotlight') {
        if (!currentSurface.spotlight) return;
        mutateCurrentSlide((s) => (s.spotlight ? { ...s, spotlight: point } : s));
        pushEvent({ type: 'spotlight_move', slideId, x: point.x, y: point.y });
        return;
      }

      const id = drawingStrokeIdRef.current;
      if (!id) return;
      mutateCurrentSlide((s) => {
        const idx = s.strokes.findIndex((st) => st.id === id);
        if (idx === -1) return s;
        const next = s.strokes.slice();
        next[idx] = { ...next[idx], points: [...next[idx].points, point] };
        return { ...s, strokes: next };
      });
      pushEvent({ type: 'stroke_point', slideId, id, point });
    },
    [isInteractive, tool, surface.currentSlideId, currentSurface.spotlight, getStagePoint, mutateCurrentSlide, pushEvent]
  );

  const handlePointerUp = useCallback(() => {
    const slideId = surface.currentSlideId;
    if (tool === 'spotlight') {
      if (currentSurface.spotlight) {
        mutateCurrentSlide((s) => ({ ...s, spotlight: null }));
        pushEvent({ type: 'spotlight_off', slideId });
      }
      return;
    }
    const id = drawingStrokeIdRef.current;
    if (!id) return;
    drawingStrokeIdRef.current = null;
    pushEvent({ type: 'stroke_end', slideId, id });
  }, [tool, surface.currentSlideId, currentSurface.spotlight, mutateCurrentSlide, pushEvent]);

  // ── Navigation ──
  const goToSlide = useCallback(
    (slideId: string) => {
      if (!isInteractive) return;
      setSurface((s) => ({ ...s, currentSlideId: slideId }));
      pushEvent({ type: 'slide_change', slideId });
    },
    [isInteractive, pushEvent]
  );

  const seekToSlide = useCallback(
    (slideId: string) => {
      if (!sim) return;
      const first = sim.events.find(
        (e) => e.type === 'slide_change' && e.slideId === slideId
      );
      if (!first) return;
      const audioEl = audioElRef.current;
      if (!audioEl) return;
      audioEl.currentTime = first.t / 1000;
      setSurface(rebuildState(sim.deck, sim.events, first.t));
      lastAppliedTimeRef.current = first.t;
      setPlaybackTime(first.t);
    },
    [sim]
  );

  // ── Bullet / clear ──
  const revealNextBullet = useCallback(() => {
    if (!currentSlide.bullets) return;
    const slideId = currentSlide.id;
    mutateCurrentSlide((s) => {
      if (s.revealed >= currentSlide.bullets!.length) return s;
      pushEvent({ type: 'reveal_bullet', slideId, index: s.revealed });
      return { ...s, revealed: s.revealed + 1 };
    });
  }, [currentSlide, mutateCurrentSlide, pushEvent]);

  const clearStrokes = useCallback(() => {
    const slideId = surface.currentSlideId;
    mutateCurrentSlide((s) => ({ ...s, strokes: [] }));
    pushEvent({ type: 'clear_strokes', slideId });
  }, [surface.currentSlideId, mutateCurrentSlide, pushEvent]);

  // ── Keyboard: space to reveal, arrows to navigate ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isInteractive) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if (e.code === 'Space') {
        e.preventDefault();
        revealNextBullet();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        const idx = deck.findIndex((s) => s.id === surface.currentSlideId);
        if (idx < deck.length - 1) goToSlide(deck[idx + 1].id);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const idx = deck.findIndex((s) => s.id === surface.currentSlideId);
        if (idx > 0) goToSlide(deck[idx - 1].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isInteractive, revealNextBullet, deck, surface.currentSlideId, goToSlide]);

  // ── Recording ──
  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const duration = performance.now() - recordStartRef.current;
        setSim((prev) => {
          if (prev?.audioUrl) URL.revokeObjectURL(prev.audioUrl);
          return {
            version: 1,
            createdAt: Date.now(),
            duration,
            deck: deck.slice(), // frozen snapshot
            events: recordingEventsRef.current.slice(),
            audioUrl: url,
          };
        });
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
        }
      };

      if (sim?.audioUrl) URL.revokeObjectURL(sim.audioUrl);
      setSim(null);
      setSurface(initialSurface(deck));
      recordingEventsRef.current = [];
      recordStartRef.current = performance.now();

      // Always emit a starting slide_change so the timeline is self-contained.
      recordingEventsRef.current.push({
        t: 0,
        type: 'slide_change',
        slideId: deck[0].id,
      });

      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setMode('recording');
      setRecordingTime(0);

      recordingTimerRef.current = window.setInterval(() => {
        setRecordingTime(performance.now() - recordStartRef.current);
        setLogTick((v) => v + 1);
      }, 150);
    } catch (err) {
      console.error(err);
      setError('Microphone permission denied or unavailable.');
    }
  }, [deck, sim]);

  const stopRecording = useCallback(() => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = 0;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setMode('idle');
  }, []);

  // ── Playback ──
  const applyUpTo = useCallback(
    (events: TimelineEvent[], ms: number, targetDeck: ExampleSlide[]) => {
      const state = rebuildState(targetDeck, events, ms);
      setSurface(state);
      lastAppliedTimeRef.current = ms;
    },
    []
  );

  const runPlaybackLoop = useCallback(() => {
    const audioEl = audioElRef.current;
    if (!audioEl || !sim) return;
    const tick = () => {
      const currentMs = audioEl.currentTime * 1000;
      if (currentMs < lastAppliedTimeRef.current) {
        applyUpTo(sim.events, currentMs, sim.deck);
      } else {
        setSurface(rebuildState(sim.deck, sim.events, currentMs));
        lastAppliedTimeRef.current = currentMs;
      }
      setPlaybackTime(currentMs);
      if (!audioEl.ended && !audioEl.paused) {
        playbackRafRef.current = requestAnimationFrame(tick);
      } else {
        playbackRafRef.current = 0;
        if (audioEl.ended) {
          setMode('idle');
          setPlaybackTime(sim.duration);
        }
      }
    };
    playbackRafRef.current = requestAnimationFrame(tick);
  }, [sim, applyUpTo]);

  const startPlayback = useCallback(() => {
    if (!sim) return;
    const audioEl = audioElRef.current;
    if (!audioEl) return;
    audioEl.currentTime = 0;
    lastAppliedTimeRef.current = 0;
    setDeck(sim.deck);
    setSurface(initialSurface(sim.deck));
    audioEl.play().catch(() => setError('Could not play audio.'));
    setMode('playing');
    runPlaybackLoop();
  }, [sim, runPlaybackLoop]);

  const pausePlayback = useCallback(() => {
    const audioEl = audioElRef.current;
    if (audioEl && !audioEl.paused) audioEl.pause();
    if (playbackRafRef.current) {
      cancelAnimationFrame(playbackRafRef.current);
      playbackRafRef.current = 0;
    }
    setMode('paused_interactive');
  }, []);

  const resumePlayback = useCallback(() => {
    if (!sim) return;
    const audioEl = audioElRef.current;
    if (!audioEl) return;
    applyUpTo(sim.events, audioEl.currentTime * 1000, sim.deck);
    audioEl.play().catch(() => {});
    setMode('playing');
    runPlaybackLoop();
  }, [sim, applyUpTo, runPlaybackLoop]);

  const handleSeek = useCallback(
    (ms: number) => {
      if (!sim) return;
      const audioEl = audioElRef.current;
      if (!audioEl) return;
      audioEl.currentTime = ms / 1000;
      applyUpTo(sim.events, ms, sim.deck);
      setPlaybackTime(ms);
    },
    [sim, applyUpTo]
  );

  const discardSim = useCallback(() => {
    if (sim?.audioUrl) URL.revokeObjectURL(sim.audioUrl);
    setSim(null);
    setDeck(EXAMPLE_DECK);
    setSurface(initialSurface(EXAMPLE_DECK));
    setPlaybackTime(0);
    setMode('idle');
  }, [sim]);

  // ── Save / load sim file ──
  const saveSimToFile = useCallback(async () => {
    if (!sim || !sim.audioUrl) return;
    try {
      const audioBlob = await urlToBlob(sim.audioUrl);
      const audioDataUrl = await blobToDataUrl(audioBlob);
      const file: SimFile = {
        version: 1,
        createdAt: sim.createdAt,
        duration: sim.duration,
        deck: sim.deck,
        events: sim.events,
        audio: audioDataUrl,
      };
      const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fractions-lesson-${sim.createdAt}.sim.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      setError('Failed to save sim file.');
    }
  }, [sim]);

  const loadSimFromFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text) as SimFile;
      if (data.version !== 1) throw new Error('Unsupported sim version');

      let audioUrl: string | null = null;
      if (data.audio) {
        const res = await fetch(data.audio);
        const blob = await res.blob();
        audioUrl = URL.createObjectURL(blob);
      }

      if (sim?.audioUrl) URL.revokeObjectURL(sim.audioUrl);
      setSim({
        version: 1,
        createdAt: data.createdAt,
        duration: data.duration,
        deck: data.deck,
        events: data.events,
        audioUrl,
      });
      setDeck(data.deck);
      setSurface(initialSurface(data.deck));
      setPlaybackTime(0);
      setMode('idle');
      setError(null);
    } catch (e) {
      console.error(e);
      setError('Invalid sim file.');
    }
  }, [sim]);

  // ── Render ──
  const liveEvents = mode === 'recording' ? recordingEventsRef.current : sim?.events || [];
  const simSizeKB = sim ? (JSON.stringify(sim.events).length / 1024).toFixed(1) : '0.0';
  const deckSizeKB = (JSON.stringify(deck).length / 1024).toFixed(1);
  void logTick;

  // Sim Lab is a development-only POC — block in production builds.
  if (process.env.NODE_ENV === 'production') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Sim Lab is only available in development mode.</p>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Sim Lab — Multi-slide</h1>
          <p className="text-xs text-gray-500">
            Event-sourced lesson recording over a real slide deck. Audio + timeline, not video.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-gray-400">
            mode: <code className="text-gray-700">{mode}</code>
          </span>
          <button
            onClick={() => setShowStorageInfo((v) => !v)}
            className="px-2.5 py-1 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            {showStorageInfo ? 'Hide' : 'Show'} storage info
          </button>
          <Link href="/" className="text-gray-500 hover:text-gray-800 underline">← Back</Link>
        </div>
      </header>

      {error && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-2 text-sm text-red-700 flex-shrink-0">
          {error}
        </div>
      )}

      {showStorageInfo && <StorageInfoPanel />}

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Slide thumbnail strip */}
        <div className="w-40 bg-white border-r flex flex-col flex-shrink-0 overflow-y-auto">
          <div className="px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider border-b">
            Deck ({deck.length})
          </div>
          {deck.map((slide, i) => {
            const s = surface.slides[slide.id] || initialSlideSurface();
            const isCurrent = slide.id === surface.currentSlideId;
            return (
              <button
                key={slide.id}
                onClick={() =>
                  mode === 'playing' ? seekToSlide(slide.id) : goToSlide(slide.id)
                }
                className={`text-left px-3 py-2 border-b border-gray-100 transition-colors ${
                  isCurrent ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'hover:bg-gray-50 border-l-4 border-l-transparent'
                }`}
              >
                <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-mono">
                  <span>#{i + 1}</span>
                  <span className="uppercase">{slide.kind}</span>
                  {s.strokes.length > 0 && <span title="has drawings">✏️</span>}
                </div>
                <div className="text-xs font-medium text-gray-800 mt-0.5 leading-tight line-clamp-2">
                  {slide.title}
                </div>
              </button>
            );
          })}
        </div>

        {/* Stage */}
        <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
          <div
            ref={stageRef}
            className="relative rounded-2xl overflow-hidden shadow-2xl bg-white select-none"
            style={{
              width: '100%',
              maxWidth: `${STAGE_W}px`,
              aspectRatio: `${STAGE_W} / ${STAGE_H}`,
              cursor: tool === 'pen' ? 'crosshair' : tool === 'spotlight' ? 'none' : 'default',
              touchAction: 'none',
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <SlideRenderer slide={currentSlide} surface={currentSurface} />

            {/* Stroke layer */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
              preserveAspectRatio="none"
            >
              {currentSurface.strokes.map((stroke) => (
                <polyline
                  key={stroke.id}
                  points={stroke.points.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={stroke.color}
                  strokeWidth={stroke.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </svg>

            {/* Spotlight */}
            {currentSurface.spotlight && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: `radial-gradient(circle at ${
                    (currentSurface.spotlight.x / STAGE_W) * 100
                  }% ${
                    (currentSurface.spotlight.y / STAGE_H) * 100
                  }%, transparent 90px, rgba(0,0,0,0.6) 180px)`,
                }}
              />
            )}

            {/* Status chips */}
            <div className="absolute top-4 left-4 flex items-center gap-2 pointer-events-none">
              {mode === 'recording' && (
                <div className="bg-red-600 text-white text-xs font-bold rounded-full px-3 py-1.5 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  REC {formatMs(recordingTime)}
                </div>
              )}
              {mode === 'playing' && (
                <div className="bg-blue-600 text-white text-xs font-bold rounded-full px-3 py-1.5">
                  ▶ PLAYING
                </div>
              )}
              {mode === 'paused_interactive' && (
                <div className="bg-amber-500 text-white text-xs font-bold rounded-full px-3 py-1.5">
                  ⏸ YOU&apos;RE DRIVING — draw freely, hit Resume to continue
                </div>
              )}
            </div>

            {/* Slide counter */}
            <div className="absolute bottom-4 right-4 bg-black/60 text-white text-xs font-mono rounded-full px-2.5 py-1 pointer-events-none">
              {deck.findIndex((s) => s.id === surface.currentSlideId) + 1} / {deck.length}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="w-80 bg-white border-l flex flex-col flex-shrink-0 overflow-hidden">
          <div className="p-4 border-b space-y-3 flex-shrink-0">
            <div>
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                Tool
              </label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setTool('pen')}
                  className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                    tool === 'pen'
                      ? 'bg-[#007229] text-white border-[#007229]'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  ✏️ Pen
                </button>
                <button
                  onClick={() => setTool('spotlight')}
                  className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                    tool === 'spotlight'
                      ? 'bg-[#007229] text-white border-[#007229]'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  🔦 Spotlight
                </button>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                Color
              </label>
              <div className="mt-1.5 flex gap-2">
                {['#000000', '#DC2626', '#2563EB', '#16A34A'].map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      color === c ? 'border-[#007229] scale-110' : 'border-gray-200'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={revealNextBullet}
                disabled={!isInteractive || !currentSlide.bullets}
                className="flex-1 px-3 py-2 text-xs rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 disabled:opacity-40"
                title="or press Space"
              >
                Reveal bullet (Space)
              </button>
              <button
                onClick={clearStrokes}
                disabled={!isInteractive}
                className="flex-1 px-3 py-2 text-xs rounded-lg bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 disabled:opacity-40"
              >
                Clear
              </button>
            </div>
            <p className="text-[10px] text-gray-400 leading-snug">
              Use ← → to navigate between slides. Slide changes are recorded as events.
            </p>
          </div>

          {/* Recording */}
          <div className="p-4 border-b space-y-2 flex-shrink-0">
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
              Recording
            </label>
            {mode !== 'recording' ? (
              <button
                onClick={startRecording}
                disabled={mode === 'playing'}
                className="w-full px-3 py-2.5 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
              >
                ● Start Recording
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="w-full px-3 py-2.5 text-sm font-semibold rounded-lg bg-gray-900 text-white hover:bg-black"
              >
                ■ Stop ({formatMs(recordingTime)})
              </button>
            )}
          </div>

          {/* Playback */}
          {sim && (
            <div className="p-4 border-b space-y-3 flex-shrink-0">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                Playback
              </label>
              <div className="flex gap-2">
                {mode === 'playing' ? (
                  <button
                    onClick={pausePlayback}
                    className="flex-1 px-3 py-2 text-sm font-semibold rounded-lg bg-amber-500 text-white hover:bg-amber-600"
                  >
                    ⏸ Pause & interact
                  </button>
                ) : (
                  <button
                    onClick={mode === 'paused_interactive' ? resumePlayback : startPlayback}
                    className="flex-1 px-3 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                  >
                    ▶ {mode === 'paused_interactive' ? 'Resume teacher' : 'Play'}
                  </button>
                )}
                <button
                  onClick={discardSim}
                  className="px-3 py-2 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  Discard
                </button>
              </div>
              <div>
                <input
                  type="range"
                  min={0}
                  max={sim.duration}
                  value={playbackTime}
                  onChange={(e) => handleSeek(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
                <div className="flex justify-between text-[10px] text-gray-500 font-mono mt-0.5">
                  <span>{formatMs(playbackTime)}</span>
                  <span>{formatMs(sim.duration)}</span>
                </div>
              </div>
              <audio
                ref={audioElRef}
                src={sim.audioUrl || undefined}
                onEnded={() => {
                  setMode('idle');
                  if (sim) setPlaybackTime(sim.duration);
                }}
              />
            </div>
          )}

          {/* Save / load */}
          <div className="p-4 border-b space-y-2 flex-shrink-0">
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
              Sim file (storage demo)
            </label>
            <div className="flex gap-2">
              <button
                onClick={saveSimToFile}
                disabled={!sim}
                className="flex-1 px-3 py-2 text-xs rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-40"
              >
                ⬇ Save .sim.json
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 px-3 py-2 text-xs rounded-lg bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100"
              >
                ⬆ Load
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) loadSimFromFile(f);
                  if (e.target) e.target.value = '';
                }}
              />
            </div>
            <p className="text-[10px] text-gray-400 leading-snug">
              Self-contained JSON: deck snapshot + events + audio (base64).
            </p>
          </div>

          {/* Stats */}
          <div className="p-4 border-b flex-shrink-0">
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
              Stats
            </label>
            <div className="mt-1.5 text-[11px] text-gray-600 space-y-0.5 font-mono">
              <div>deck: {deck.length} slides (~{deckSizeKB} KB)</div>
              <div>current slide: {currentSlide.id}</div>
              <div>strokes here: {currentSurface.strokes.length}</div>
              <div>spotlight: {currentSurface.spotlight ? 'on' : 'off'}</div>
              {sim && (
                <>
                  <div className="pt-1.5 mt-1.5 border-t border-gray-100">
                    events: {sim.events.length}
                  </div>
                  <div>events size: ~{simSizeKB} KB</div>
                  <div>duration: {formatMs(sim.duration)}</div>
                </>
              )}
            </div>
          </div>

          {/* Event log */}
          <div className="flex-1 overflow-y-auto p-4 min-h-0">
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
              Event log (last 80)
            </label>
            <div className="mt-1.5 space-y-0.5 text-[10px] font-mono text-gray-600">
              {liveEvents.length === 0 && (
                <div className="text-gray-400 italic">No events yet</div>
              )}
              {liveEvents.slice(-80).map((ev, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-gray-400 tabular-nums w-10 text-right">
                    {(ev.t / 1000).toFixed(1)}s
                  </span>
                  <span className="text-gray-700">{ev.type}</span>
                  {'slideId' in ev && (
                    <span className="text-blue-500">·{ev.slideId}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ── Slide renderer ──

function SlideRenderer({
  slide,
  surface,
}: {
  slide: ExampleSlide;
  surface: SlideSurface;
}) {
  if (slide.kind === 'title') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-amber-50 via-white to-rose-50 pointer-events-none">
        <h2 className="text-7xl font-black text-gray-900 tracking-tight">{slide.title}</h2>
        {slide.subtitle && (
          <p className="text-2xl text-gray-500 mt-6">{slide.subtitle}</p>
        )}
      </div>
    );
  }

  if (slide.kind === 'bullets') {
    return (
      <div className="absolute inset-0 bg-gradient-to-br from-white to-blue-50 pointer-events-none">
        <div className="absolute top-10 left-0 right-0 text-center">
          <h2 className="text-5xl font-black text-gray-900">{slide.title}</h2>
        </div>
        <div className="absolute left-20 right-20 top-48 space-y-7">
          {(slide.bullets || []).map((bullet, i) => (
            <div
              key={i}
              className={`flex items-start gap-5 transition-all duration-500 ${
                i < surface.revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              }`}
            >
              <span className="flex-shrink-0 w-12 h-12 rounded-full bg-[#007229] text-white text-2xl font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <p className="text-3xl text-gray-800 font-medium leading-relaxed">{bullet}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (slide.kind === 'diagram') {
    return (
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 to-white pointer-events-none">
        <div className="absolute top-10 left-0 right-0 text-center">
          <h2 className="text-5xl font-black text-gray-900">{slide.title}</h2>
          {slide.subtitle && (
            <p className="text-xl text-gray-500 mt-3">{slide.subtitle}</p>
          )}
        </div>
        <div className="absolute top-52 left-0 right-0 flex items-center justify-center gap-16">
          <FractionBox total={4} filled={1} label="1⁄4" />
          <span className="text-8xl text-gray-400 font-light">+</span>
          <FractionBox total={4} filled={2} label="2⁄4" />
          <span className="text-8xl text-gray-400 font-light">=</span>
          <FractionBox total={4} filled={3} label="?" dim />
        </div>
      </div>
    );
  }

  if (slide.kind === 'question') {
    return (
      <div className="absolute inset-0 bg-gradient-to-br from-yellow-50 via-white to-orange-50 pointer-events-none">
        <div className="absolute top-10 left-0 right-0 text-center">
          <span className="inline-block px-4 py-1 bg-amber-200 text-amber-900 text-sm font-semibold rounded-full">
            YOUR TURN
          </span>
          <h2 className="text-5xl font-black text-gray-900 mt-3">{slide.title}</h2>
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-8xl font-black text-gray-800 font-mono">{slide.question}</div>
        </div>
      </div>
    );
  }

  return null;
}

function FractionBox({
  total,
  filled,
  label,
  dim = false,
}: {
  total: number;
  filled: number;
  label: string;
  dim?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center gap-3 ${dim ? 'opacity-40' : ''}`}>
      <div className="flex border-4 border-gray-800 rounded-lg overflow-hidden">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`w-20 h-20 ${
              i < filled ? 'bg-[#007229]' : 'bg-white'
            } ${i < total - 1 ? 'border-r-2 border-gray-800' : ''}`}
          />
        ))}
      </div>
      <span className="text-4xl font-black text-gray-800">{label}</span>
    </div>
  );
}

// ── Storage info panel ──

function StorageInfoPanel() {
  return (
    <div className="bg-slate-900 text-slate-100 px-6 py-4 border-b border-slate-700 text-xs leading-relaxed flex-shrink-0 max-h-[40vh] overflow-y-auto">
      <div className="grid grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-bold text-white mb-2">This POC (.sim.json)</h3>
          <p className="text-slate-300 mb-2">
            Everything inlined into one downloadable file. Audio is base64-encoded so you can
            email it, save it offline, version it in git, or load it back with the Load button.
          </p>
          <pre className="bg-slate-950 rounded-lg p-3 text-[10px] text-emerald-300 overflow-x-auto">
{`{
  "version": 1,
  "createdAt": 1712345678900,
  "duration": 45230,
  "deck": [
    { "id": "intro", "kind": "title", "title": "Adding Fractions", ... },
    { "id": "what",  "kind": "bullets", ... },
    ...
  ],
  "events": [
    { "t": 0,    "type": "slide_change", "slideId": "intro" },
    { "t": 1240, "type": "stroke_start", "slideId": "intro", "id": "s-...", ... },
    { "t": 1260, "type": "stroke_point", "slideId": "intro", "id": "s-...", ... },
    ...
  ],
  "audio": "data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC..."
}`}
          </pre>
        </div>
        <div>
          <h3 className="text-sm font-bold text-white mb-2">In production (Supabase)</h3>
          <p className="text-slate-300 mb-2">
            Split the same data across a Postgres row and a Storage object. Events and the deck
            snapshot live in <code className="text-amber-300">jsonb</code>; audio goes to a
            bucket keyed by the sim&apos;s id.
          </p>
          <pre className="bg-slate-950 rounded-lg p-3 text-[10px] text-amber-300 overflow-x-auto">
{`create table lesson_sims (
  id             uuid primary key default gen_random_uuid(),
  lesson_id      uuid references lessons(id) on delete cascade,
  teacher_id     uuid references auth.users(id),
  deck_snapshot  jsonb  not null,  -- frozen at record time
  events         jsonb  not null,  -- the timeline
  audio_path     text   not null,  -- key in storage bucket
  duration_ms    int    not null,
  created_at     timestamptz default now()
);

-- Storage bucket: 'sim-audio'
--   sim-audio/<sim_id>.webm

-- RLS: students see sims for lessons
-- they are enrolled in; teachers see
-- only their own.`}
          </pre>
          <p className="text-slate-400 mt-2 text-[11px]">
            Why snapshot the deck? Because the teacher might edit the deck a week after
            recording, and old sims must still replay against the original. The snapshot
            is the single source of truth for that recording.
          </p>
        </div>
      </div>
    </div>
  );
}
