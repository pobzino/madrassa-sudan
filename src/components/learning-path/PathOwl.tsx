"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { LivingOwl } from "@/components/brand/LivingOwl";

/**
 * The owl on the learning path. When a different lesson is picked it takes
 * off from the old one, flaps over in an arc, and lands on the new one.
 * `dx`/`dy` are where it starts, relative to where it lands.
 */
export function PathOwl({ dx, dy }: { dx: number; dy: number }) {
  const distance = Math.hypot(dx, dy);
  // Longer hops take a little longer, within limits.
  const duration = Math.round(Math.min(1800, Math.max(900, 700 + distance * 1.6)));
  const travels = distance > 1;
  const [flying, setFlying] = useState(travels);

  useEffect(() => {
    if (!travels) return;
    const landed = window.setTimeout(() => setFlying(false), duration);
    return () => window.clearTimeout(landed);
  }, [travels, duration]);

  return (
    <div
      className="motion-reduce:[animation:none]"
      style={
        {
          "--owl-dx": `${dx}px`,
          "--owl-dy": `${dy}px`,
          animation: travels ? `owl-fly-across ${duration}ms cubic-bezier(0.45, 0, 0.25, 1) both` : undefined,
        } as CSSProperties
      }
    >
      {/* A lift in the middle of the flight, and a lean towards where it's going. */}
      <div
        className="motion-reduce:[animation:none]"
        style={
          {
            "--owl-lean": `${Math.sign(dx) * -8}deg`,
            "--owl-lift": `${-Math.min(70, 30 + distance * 0.25)}px`,
            animation: travels ? `owl-fly-arc ${duration}ms ease-in-out both` : undefined,
          } as CSSProperties
        }
      >
        <LivingOwl mood={flying ? "flying" : "idle"} shadow={!flying} restGaze={{ x: 0, y: 0.3 }} className="h-16 w-16 drop-shadow-md" />
      </div>
    </div>
  );
}
