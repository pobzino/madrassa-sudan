"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { Language } from "@/contexts/LanguageContext";
import { LivingOwl, type OwlMood } from "@/components/brand/LivingOwl";
import { handwritingClass } from "./handwriting";
import { isHomeStats, roundDownStat, statNumberFormat, type HomeStats } from "@/lib/home-stats";
import { PARTNERS } from "@/lib/partners";

const copy = {
  en: {
    title: "Sudan's children are learning with Amal",
    subtitle: "Free Maths and English lessons with Practice that checks every answer, in Arabic and English.",
    stats: {
      signups: "Sign-ups so far",
      lessonsCompleted: "Lessons completed",
      practiceAttempts: "Practice sets completed",
    },
    partnersLabel: "In partnership with",
  },
  ar: {
    title: "أطفال السودان يتعلمون مع آمال",
    subtitle: "دروس مجانية في الرياضيات واللغة الإنجليزية، مع تدريب يصحّح كل إجابة، بالعربية والإنجليزية.",
    stats: {
      signups: "حساب مسجّل حتى الآن",
      lessonsCompleted: "درس مكتمل",
      practiceAttempts: "تدريب مكتمل",
    },
    partnersLabel: "بالشراكة مع",
  },
};

const POLL_MS = 30_000;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Keeps the counters in step with the live totals while the page is open.
function useLiveStats(initial: HomeStats, onIncrease: () => void) {
  const [stats, setStats] = useState(initial);
  const statsRef = useRef(initial);
  const onIncreaseRef = useRef(onIncrease);

  useEffect(() => {
    statsRef.current = stats;
    onIncreaseRef.current = onIncrease;
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/public-stats", { cache: "no-store" });
        if (!response.ok) return;
        const next: unknown = await response.json();
        if (cancelled || !isHomeStats(next)) return;
        const current = statsRef.current;
        if (
          next.live &&
          current.live &&
          (next.signups > current.signups || next.lessonsCompleted > current.lessonsCompleted || next.practiceAttempts > current.practiceAttempts)
        ) {
          onIncreaseRef.current();
        }
        // Counts only ever go up; ignore an older cached response.
        setStats((current) =>
          next.live
            ? {
                signups: Math.max(current.signups, next.signups),
                lessonsCompleted: Math.max(current.lessonsCompleted, next.lessonsCompleted),
                practiceAttempts: Math.max(current.practiceAttempts, next.practiceAttempts),
                live: true,
              }
            : current,
        );
      } catch {
        // Keep showing the last good numbers.
      }
    };
    void load();
    const timer = window.setInterval(load, POLL_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);

  return stats;
}

/**
 * Counts up from zero the first time the figure scrolls into view, then
 * ticks to each new value as live totals arrive.
 */
function useAnimatedNumber(target: number) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  const [value, setValue] = useState(target);
  const [bumps, setBumps] = useState(0);
  const valueRef = useRef(target);
  const targetRef = useRef(target);
  const seenRef = useRef(true);
  const frameRef = useRef(0);

  const animateTo = useCallback((to: number) => {
    cancelAnimationFrame(frameRef.current);
    const from = valueRef.current;
    if (from === to) return;
    if (prefersReducedMotion()) {
      frameRef.current = requestAnimationFrame(() => {
        valueRef.current = to;
        setValue(to);
      });
      return;
    }
    const start = performance.now();
    const duration = from === 0 ? 1200 : 900;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const next = Math.round(from + (to - from) * (1 - Math.pow(1 - progress, 3)));
      valueRef.current = next;
      setValue(next);
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame((now) => {
      if (from > 0 && to > from) setBumps((n) => n + 1);
      tick(now);
    });
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined" || prefersReducedMotion()) return;
    // Only figures that start off-screen are reset and counted up, so nothing
    // already on screen flickers.
    let armed = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          if (!armed) {
            armed = true;
            seenRef.current = false;
            valueRef.current = 0;
            setValue(0);
          }
          return;
        }
        observer.disconnect();
        seenRef.current = true;
        if (armed) animateTo(targetRef.current);
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frameRef.current);
    };
  }, [animateTo]);

  useEffect(() => {
    targetRef.current = target;
    if (seenRef.current) animateTo(target);
  }, [target, animateTo]);

  return { ref, value, bumps };
}

// Chalk colours for the underline under each figure.
const CHALK = ["#FDE68A", "#FBCFE8", "#BBF7D0"];

// One figure written on the board in chalk, with a hand-drawn underline.
function ChalkStat({
  value,
  live,
  label,
  formatter,
  chalk,
  hand,
}: {
  value: number;
  live: boolean;
  label: string;
  formatter: Intl.NumberFormat;
  chalk: string;
  hand: string;
}) {
  // Live counts are shown exactly; fallback minimums are rounded with a "+".
  const target = live ? value : roundDownStat(value);
  const { ref, value: shown, bumps } = useAnimatedNumber(target);

  return (
    <li className="flex items-baseline gap-4 sm:block">
      <p ref={ref} className={`${hand} shrink-0 text-6xl leading-none text-[#fffdf2] tabular-nums sm:text-7xl`} style={{ textShadow: "0 0 2px rgba(255,255,255,.45)" }}>
        {/* Re-keyed on each new count so the fresh number is "rewritten" in chalk. */}
        <span aria-hidden key={bumps} className={`inline-block ${bumps > 0 ? "animate-[chalk-write_.9s_ease-out]" : ""}`}>
          {formatter.format(shown)}
          {!live && "+"}
        </span>
        <span className="sr-only">
          {formatter.format(target)}
          {live ? "" : "+"}
        </span>
      </p>
      <div className="min-w-0">
        <svg aria-hidden viewBox="0 0 120 12" className="hidden h-3 w-28 sm:block" fill="none">
          <path d="M3 8C25 3 48 10 70 6S108 3 117 7" stroke={chalk} strokeWidth="3" strokeLinecap="round" opacity="0.85" />
        </svg>
        <p className={`${hand} text-2xl leading-tight text-white/85 sm:mt-1`}>{label}</p>
      </div>
    </li>
  );
}

/**
 * The live numbers written on a classroom chalkboard (brand green, wooden
 * frame), with the owl perched on top like the teacher: it waves when the
 * board comes into view and hops when a new sign-up ticks a number up.
 */
export function SocialProof({ stats: initialStats, language }: { stats: HomeStats; language: Language }) {
  const txt = copy[language];
  const hand = handwritingClass(language);
  const [owlMood, setOwlMood] = useState<OwlMood>("idle");
  const boardRef = useRef<HTMLDivElement>(null);
  const moodTimer = useRef(0);

  const react = useCallback((mood: OwlMood, ms: number) => {
    window.clearTimeout(moodTimer.current);
    setOwlMood(mood);
    moodTimer.current = window.setTimeout(() => setOwlMood("idle"), ms);
  }, []);

  const stats = useLiveStats(initialStats, () => react("excited", 1800));
  const formatter = statNumberFormat(language);

  useEffect(() => {
    const node = boardRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        react("wave", 2600);
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      window.clearTimeout(moodTimer.current);
    };
  }, [react]);

  return (
    <section aria-labelledby="social-proof-title" className="relative bg-white py-14 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-14">
          <div className="text-center lg:text-start">
            <h2
              id="social-proof-title"
              className="font-fredoka text-3xl font-semibold leading-tight text-gray-900 sm:text-4xl lg:text-5xl"
            >
              {txt.title}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-gray-600 sm:text-lg lg:mx-0">{txt.subtitle}</p>
          </div>

          <div ref={boardRef} className="relative pt-14 sm:pt-16">
            {/* The owl teacher sits on the frame. */}
            <div aria-hidden className="absolute top-0 z-10 w-20 ltr:right-6 rtl:left-6 sm:w-24">
              <LivingOwl mood={owlMood} restGaze={{ x: language === "ar" ? 0.5 : -0.5, y: 0.5 }} className="w-full" />
            </div>

            {/* Wooden frame around the board. */}
            <div className="relative rounded-[1.75rem] bg-[#c8843a] p-2.5 shadow-[0_24px_50px_-22px_rgba(120,60,10,.55)] sm:p-3.5">
              <div
                className="relative overflow-hidden rounded-[1.2rem] px-6 pb-9 pt-7 sm:px-9 sm:pb-11 sm:pt-9"
                style={{ background: "radial-gradient(120% 95% at 25% 15%, #1a7a43 0%, #0f6233 55%, #0b522a 100%)" }}
              >
                {/* Faint smudges of old chalk. */}
                <span aria-hidden className="absolute inset-0 opacity-60" style={{ backgroundImage: "radial-gradient(40% 30% at 70% 30%, rgba(255,255,255,.07), transparent 70%), radial-gradient(30% 25% at 20% 80%, rgba(255,255,255,.06), transparent 70%)" }} />
                <ul className="relative grid gap-6 sm:grid-cols-3 sm:gap-6">
                  <ChalkStat value={stats.signups} live={stats.live} label={txt.stats.signups} formatter={formatter} chalk={CHALK[0]} hand={hand} />
                  <ChalkStat value={stats.lessonsCompleted} live={stats.live} label={txt.stats.lessonsCompleted} formatter={formatter} chalk={CHALK[1]} hand={hand} />
                  <ChalkStat value={stats.practiceAttempts} live={stats.live} label={txt.stats.practiceAttempts} formatter={formatter} chalk={CHALK[2]} hand={hand} />
                </ul>
              </div>
              {/* Chalk tray with a stick of chalk and a duster. */}
              <div aria-hidden className="absolute inset-x-8 -bottom-2.5 h-3 rounded-full bg-[#a86a28] shadow-[0_3px_0_rgba(0,0,0,.12)]">
                <span className="absolute -top-1.5 h-2 w-9 rounded-full bg-[#fffdf2] ltr:left-8 rtl:right-8" />
                <span className="absolute -top-3 h-3.5 w-12 rounded-md bg-[#3f3f46] ltr:right-10 rtl:left-10">
                  <span className="absolute inset-x-0 bottom-0 h-1.5 rounded-b-md bg-[#d4d4d8]" />
                </span>
              </div>
            </div>
          </div>
        </div>

        <div id="partners" className="mt-16 scroll-mt-20 sm:mt-20">
          <p className="text-center text-sm text-gray-500">{txt.partnersLabel}</p>
          <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
            {PARTNERS.map((partner) => {
              const name = language === "ar" ? partner.nameAr : partner.name;
              return (
                <li key={partner.id}>
                  <a
                    href={partner.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={name}
                    className="block rounded-md transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#007229]"
                  >
                    <Image
                      src={partner.logo.src}
                      alt={name}
                      width={partner.logo.width}
                      height={partner.logo.height}
                      className={partner.logo.className}
                    />
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
