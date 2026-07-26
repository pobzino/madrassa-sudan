"use client";

import { useEffect, useRef } from "react";

// Small celebratory confetti burst on a transparent canvas overlay. Fired by
// bumping `burst`; respects prefers-reduced-motion; never blocks interaction.

const COLORS = ["#007229", "#00913D", "#D21034", "#F59E0B", "#E9C46A", "#FFFFFF"];

interface ConfettiBurstProps {
  /** Increment to fire a burst. 0 = no burst yet. */
  burst: number;
  /** 0..1 fractions of the canvas where the burst originates. */
  originX?: number;
  originY?: number;
  /** Bigger celebration (pass screen). */
  big?: boolean;
  className?: string;
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  size: number; color: string; rotation: number; vr: number; life: number;
}

export default function ConfettiBurst({ burst, originX = 0.5, originY = 0.4, big = false, className = "" }: ConfettiBurstProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    if (!burst) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const count = big ? 90 : 32;
    const cx = rect.width * originX;
    const cy = rect.height * originY;
    const fresh: Particle[] = Array.from({ length: count }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = (big ? 5 : 3.4) * (0.4 + Math.random());
      return {
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (big ? 2.5 : 1.8),
        size: 4 + Math.random() * (big ? 6 : 4),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rotation: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        life: 1,
      };
    });
    particlesRef.current = [...particlesRef.current, ...fresh];

    const decay = big ? 0.012 : 0.02;
    cancelAnimationFrame(rafRef.current);
    const tick = () => {
      const particles = particlesRef.current;
      ctx.clearRect(0, 0, rect.width, rect.height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.16; // gravity
        p.vx *= 0.99;
        p.rotation += p.vr;
        p.life -= decay;
        if (p.life <= 0) continue;
        ctx.save();
        ctx.globalAlpha = Math.max(p.life, 0);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      particlesRef.current = particles.filter((p) => p.life > 0);
      if (particlesRef.current.length > 0) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, rect.width, rect.height);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
  }, [burst, big, originX, originY]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}
