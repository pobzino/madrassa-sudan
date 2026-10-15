"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LivingOwl } from "@/components/brand/LivingOwl";

/**
 * The owl on the learning path. When a different lesson is picked it takes
 * off from the old one, flaps over in an arc, and lands on the new one.
 * `dx`/`dy` are where it starts, relative to where it lands.
 *
 * The flight runs through the Web Animations API with plain numbers, not CSS
 * keyframes reading custom properties: Safari (so every iPhone) can't
 * interpolate those, and snaps between keyframes instead of moving.
 */
export function PathOwl({ dx, dy }: { dx: number; dy: number }) {
  const travelRef = useRef<HTMLDivElement>(null);
  const arcRef = useRef<HTMLDivElement>(null);
  const distance = Math.hypot(dx, dy);
  // Longer hops take a little longer, within limits.
  const duration = Math.round(Math.min(1800, Math.max(900, 700 + distance * 1.6)));
  const travels = distance > 1;
  const [flying, setFlying] = useState(travels);

  // Before paint, so the owl never flashes at the new lesson first.
  useLayoutEffect(() => {
    if (!travels || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lift = -Math.min(70, 30 + distance * 0.25);
    const lean = Math.sign(dx) * -8;
    const across = travelRef.current?.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0px, 0px)" }],
      { duration, easing: "cubic-bezier(0.45, 0, 0.25, 1)", fill: "both" },
    );
    const arc = arcRef.current?.animate(
      [
        { transform: "translateY(0px) rotate(0deg)", offset: 0 },
        { transform: `translateY(${lift * 0.6}px) rotate(${lean}deg)`, offset: 0.15 },
        { transform: `translateY(${lift}px) rotate(${lean}deg)`, offset: 0.5 },
        { transform: `translateY(${lift * 0.35}px) rotate(${lean * 0.5}deg)`, offset: 0.85 },
        { transform: "translateY(0px) rotate(0deg)", offset: 1 },
      ],
      { duration, easing: "ease-in-out", fill: "both" },
    );
    return () => {
      across?.cancel();
      arc?.cancel();
    };
  }, [travels, dx, dy, distance, duration]);

  // Fold the wings and stand once it has landed.
  useEffect(() => {
    if (!travels) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const landed = window.setTimeout(() => setFlying(false), reduce ? 0 : duration);
    return () => window.clearTimeout(landed);
  }, [travels, duration]);

  return (
    <div ref={travelRef}>
      <div ref={arcRef}>
        <LivingOwl mood={flying ? "flying" : "idle"} shadow={!flying} restGaze={{ x: 0, y: 0.3 }} className="h-16 w-16 drop-shadow-md" />
      </div>
    </div>
  );
}
