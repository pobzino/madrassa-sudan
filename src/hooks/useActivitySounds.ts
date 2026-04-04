'use client';

import { useCallback, useRef } from 'react';

/**
 * Web Audio API hook for activity sound effects.
 * Generates short procedural tones — no audio files needed.
 * Respects localStorage mute preference (`activity-sounds-muted`).
 */
export function useActivitySounds() {
  const ctxRef = useRef<AudioContext | null>(null);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    if (ctxRef.current.state === 'suspended') {
      void ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);

  const playTone = useCallback(
    (frequency: number, type: OscillatorType, duration: number, gainPeak: number) => {
      try {
        if (typeof window === 'undefined') return;
        if (localStorage.getItem('activity-sounds-muted') === '1') return;

        const ctx = getCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, ctx.currentTime);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(gainPeak, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
      } catch {
        // Silently ignore — never block the UI
      }
    },
    [getCtx]
  );

  const playCorrect = useCallback(() => {
    // Two ascending notes: C5 → E5
    playTone(523, 'sine', 0.15, 0.3);
    setTimeout(() => playTone(659, 'sine', 0.25, 0.3), 120);
  }, [playTone]);

  const playIncorrect = useCallback(() => {
    // Single low descending tone
    playTone(300, 'triangle', 0.2, 0.2);
  }, [playTone]);

  const playComplete = useCallback(() => {
    // Three ascending notes: C5 → E5 → G5
    playTone(523, 'sine', 0.15, 0.25);
    setTimeout(() => playTone(659, 'sine', 0.15, 0.25), 100);
    setTimeout(() => playTone(784, 'sine', 0.3, 0.3), 200);
  }, [playTone]);

  const playTap = useCallback(() => {
    // Short high tick
    playTone(800, 'sine', 0.06, 0.15);
  }, [playTone]);

  return { playCorrect, playIncorrect, playComplete, playTap };
}
