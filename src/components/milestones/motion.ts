"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useActivitySounds } from "@/hooks/useActivitySounds";

/** Same key `useActivitySounds` reads: one switch silences sounds and buzzes. */
export const SOUND_MUTE_KEY = "activity-sounds-muted";

function subscribeReducedMotion(callback: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  );
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A short Web Animations API effect (all under 1s). Under reduced motion it is
 * replaced by a quick opacity blink so the change is still noticeable.
 */
export function play(
  element: Element | null | undefined,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions = {}
): Animation | null {
  if (!element || typeof element.animate !== "function") return null;
  if (prefersReducedMotion()) {
    return element.animate([{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }], { duration: 300, easing: "ease-out" });
  }
  return element.animate(keyframes, { duration: 600, easing: "cubic-bezier(0.34, 1.4, 0.64, 1)", ...options });
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(SOUND_MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Gentle chimes from `useActivitySounds` plus a tiny buzz on phones that can,
 * both silenced by the visible mute toggle.
 */
export function useBattleFeedback() {
  const { playCorrect, playIncorrect, playComplete } = useActivitySounds();
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    // localStorage is only readable after mount.
    const id = window.setTimeout(() => setMuted(readMuted()), 0);
    return () => window.clearTimeout(id);
  }, []);

  const toggleMuted = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      try {
        if (next) localStorage.setItem(SOUND_MUTE_KEY, "1");
        else localStorage.removeItem(SOUND_MUTE_KEY);
      } catch {
        // Storage can be blocked; the toggle still works for this visit.
      }
      return next;
    });
  }, []);

  const buzz = useCallback((ms = 25) => {
    // Silent when muted, and still under reduced motion.
    if (readMuted() || prefersReducedMotion()) return;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(ms);
      } catch {
        // Some browsers throw without a user gesture.
      }
    }
  }, []);

  const right = useCallback(
    (big = false) => {
      playCorrect();
      buzz(big ? 60 : 25);
    },
    [playCorrect, buzz]
  );

  const wrong = useCallback(() => {
    playIncorrect();
    buzz(15);
  }, [playIncorrect, buzz]);

  const celebrate = useCallback(() => {
    playComplete();
    buzz();
  }, [playComplete, buzz]);

  return { muted, toggleMuted, right, wrong, celebrate };
}
