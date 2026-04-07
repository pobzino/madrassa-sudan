'use client';

import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'madrassa-sim-tour';

interface TourStorage {
  /** Which segment to auto-start on next page load (cross-page handoff). */
  pendingSegment?: string;
  /** Whether the user has completed or dismissed the tour at least once. */
  completed?: boolean;
}

function read(): TourStorage {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TourStorage) : {};
  } catch {
    return {};
  }
}

function write(patch: Partial<TourStorage>) {
  const next = { ...read(), ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  // Notify all subscribers via the storage event workaround.
  window.dispatchEvent(new Event('tour-state-change'));
}

// ── useSyncExternalStore glue ───────────────────────────────────────────────

let snapshot = read();

function subscribe(cb: () => void) {
  const handler = () => {
    snapshot = read();
    cb();
  };
  window.addEventListener('tour-state-change', handler);
  return () => window.removeEventListener('tour-state-change', handler);
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot(): TourStorage {
  return {};
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useTourState() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  /** Queue a segment to auto-start on the current (or next) page. */
  const startTour = useCallback((segment?: string) => {
    write({ pendingSegment: segment || 'lesson-list' });
  }, []);

  /** Consume the pending segment (call on mount to see if we should auto-start). */
  const consumePending = useCallback((): string | null => {
    const s = read();
    if (!s.pendingSegment) return null;
    const seg = s.pendingSegment;
    write({ pendingSegment: undefined });
    return seg;
  }, []);

  /** Mark the tour as completed/dismissed. */
  const dismissTour = useCallback(() => {
    write({ completed: true, pendingSegment: undefined });
  }, []);

  /** Reset completion so the Getting Started card reappears. */
  const resetTour = useCallback(() => {
    write({ completed: false, pendingSegment: undefined });
  }, []);

  return {
    hasCompletedTour: state.completed === true,
    hasPendingSegment: !!state.pendingSegment,
    startTour,
    consumePending,
    dismissTour,
    resetTour,
  };
}
