"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type OwlAct = "sudanese" | "party" | "curious" | "fly";

// Stable defaults, so re-renders don't restart the countdown.
const NO_OPENING: readonly OwlAct[] = [];
const DEFAULT_REST: readonly [number, number] = [4500, 8000];

type OwlShowOptions = {
  /** Acts to pick from at random once the opening is done. */
  acts: readonly OwlAct[];
  /** Acts performed first, in order. */
  opening?: readonly OwlAct[];
  /** Wait before the first act, in ms. */
  firstDelay?: number;
  /** Rest between acts, as a [min, max] range in ms. */
  rest?: readonly [number, number];
  /** Hold the show, e.g. while the owl is reacting to something else. */
  paused?: boolean;
  /** Changing this restarts the show from the opening, cancelling any act. */
  resetKey?: unknown;
};

/**
 * Runs the owl's little shows on its own: a couple of seconds after it
 * settles it performs an act, rests, then performs another. Nothing runs
 * while the owl is off screen or when the visitor prefers reduced motion.
 */
export function useOwlShow<T extends Element>({
  acts,
  opening = NO_OPENING,
  firstDelay = 2500,
  rest = DEFAULT_REST,
  paused = false,
  resetKey,
}: OwlShowOptions) {
  const ref = useRef<T | null>(null);
  const [act, setAct] = useState<OwlAct | null>(null);
  const [performed, setPerformed] = useState(0);
  const [inView, setInView] = useState(false);
  const [prevKey, setPrevKey] = useState(resetKey);
  const lastAct = useRef<OwlAct | null>(null);

  if (prevKey !== resetKey) {
    setPrevKey(resetKey);
    setAct(null);
    setPerformed(0);
  }

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.3 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (act || paused || !inView) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const [min, max] = rest;
    const delay = performed === 0 ? firstDelay : min + Math.random() * (max - min);
    const timer = window.setTimeout(() => {
      let next: OwlAct;
      if (performed < opening.length) {
        next = opening[performed];
      } else {
        const choices = acts.filter((candidate) => candidate !== lastAct.current);
        next = choices[Math.floor(Math.random() * choices.length)] ?? acts[0];
      }
      lastAct.current = next;
      setAct(next);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [act, paused, inView, performed, acts, opening, firstDelay, rest]);

  /** Call when the current act has finished. */
  const finish = useCallback(() => {
    setAct(null);
    setPerformed((count) => count + 1);
  }, []);

  /** Start an act right away, e.g. when the owl is tapped. */
  const perform = useCallback((next: OwlAct) => {
    lastAct.current = next;
    setAct((current) => current ?? next);
  }, []);

  return { ref, act, finish, perform };
}
