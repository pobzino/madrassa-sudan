"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
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
    board: "Our school so far",
    stats: {
      signups: "Sign-ups",
      lessonsCompleted: "Lessons completed",
      practiceAttempts: "Practice sets completed",
    },
    partnersLabel: "In partnership with",
  },
  ar: {
    title: "أطفال السودان يتعلمون مع آمال",
    subtitle: "دروس مجانية في الرياضيات واللغة الإنجليزية، مع تدريب يصحّح كل إجابة، بالعربية والإنجليزية.",
    board: "مدرستنا حتى الآن",
    stats: {
      signups: "حساب مسجّل",
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
// Pushpin colours for the partner cards.
const PINS = ["#D21034", "#007229", "#F59E0B"];

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
    <li className="flex flex-1 items-baseline gap-4 sm:block">
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

// A wobbly hand-drawn chalk line between figures: across on phones, down on wider screens.
function ChalkDivider() {
  return (
    <li aria-hidden role="presentation" className="my-4 sm:mx-6 sm:my-1">
      <svg viewBox="0 0 240 6" preserveAspectRatio="none" className="h-1.5 w-full sm:hidden" fill="none">
        <path d="M2 4C40 1 80 5 120 3S200 5 238 2" stroke="rgba(255,255,255,.32)" strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <svg viewBox="0 0 6 120" preserveAspectRatio="none" className="hidden h-full w-1.5 sm:block" fill="none">
        <path d="M3 2C1 30 5 58 3 86S2 110 4 118" stroke="rgba(255,255,255,.32)" strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </li>
  );
}

/**
 * The live numbers written on a classroom chalkboard (brand green, wooden
 * frame), with the owl perched on top like the teacher: it waves when the
 * board comes into view and hops when a new sign-up ticks a number up.
 * Partners are pinned up underneath like photos on a classroom wall.
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
  const figures = [
    { value: stats.signups, label: txt.stats.signups },
    { value: stats.lessonsCompleted, label: txt.stats.lessonsCompleted },
    { value: stats.practiceAttempts, label: txt.stats.practiceAttempts },
  ];

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
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-14">
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
            <div aria-hidden className="absolute top-0 z-10 w-20 ltr:right-8 rtl:left-8 sm:w-24">
              <LivingOwl mood={owlMood} restGaze={{ x: language === "ar" ? 0.5 : -0.5, y: 0.5 }} className="w-full" />
            </div>

            {/* Wooden frame: lit along the top, shadowed underneath. */}
            <div
              className="relative rounded-[1.6rem] p-3 shadow-[0_28px_50px_-24px_rgba(110,55,10,.6),inset_0_2px_0_rgba(255,255,255,.35),inset_0_-4px_0_rgba(0,0,0,.18)] sm:p-4"
              style={{ background: "linear-gradient(180deg, #d99a4e 0%, #c27d33 55%, #a9692a 100%)" }}
            >
              {/* The board, set into the frame. */}
              <div
                className="relative overflow-hidden rounded-[1.1rem] px-6 pb-10 pt-6 shadow-[inset_0_6px_18px_rgba(0,0,0,.35),inset_0_0_0_2px_rgba(0,0,0,.12)] sm:px-9 sm:pb-12 sm:pt-7"
                style={{ background: "radial-gradient(130% 100% at 25% 10%, #1b7d45 0%, #11683a 50%, #0b532c 100%)" }}
              >
                {/* Eraser streaks and old chalk dust. */}
                <span
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    backgroundImage:
                      "linear-gradient(104deg, transparent 18%, rgba(255,255,255,.045) 26%, transparent 38%), linear-gradient(98deg, transparent 52%, rgba(255,255,255,.035) 60%, transparent 72%), radial-gradient(35% 25% at 80% 85%, rgba(255,255,255,.06), transparent 70%)",
                  }}
                />

                <p className={`${hand} relative text-2xl text-white/80 sm:text-3xl`}>
                  {txt.board}
                  <svg aria-hidden viewBox="0 0 160 10" className="mt-0.5 block h-2.5 w-36" fill="none">
                    <path d="M3 6C40 2 90 8 157 4" stroke="rgba(255,255,255,.55)" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </p>

                <ul className="relative mt-5 flex flex-col sm:mt-7 sm:flex-row sm:items-stretch">
                  {figures.map((figure, i) => (
                    <Fragment key={i}>
                      {i > 0 && <ChalkDivider />}
                      <ChalkStat value={figure.value} live={stats.live} label={figure.label} formatter={formatter} chalk={CHALK[i]} hand={hand} />
                    </Fragment>
                  ))}
                </ul>

                {/* Doodles a teacher left behind. */}
                <svg aria-hidden viewBox="0 0 24 24" className="absolute bottom-3 h-6 w-6 ltr:left-4 rtl:right-4" fill="none">
                  <path d="M12 3l2.4 5.6L20 9.3l-4.3 3.9 1.3 5.8L12 16l-5 3 1.3-5.8L4 9.3l5.6-.7z" stroke="rgba(255,255,255,.4)" strokeWidth="1.6" strokeLinejoin="round" />
                </svg>
                <span aria-hidden className={`${hand} absolute bottom-2 text-2xl text-[#FDE68A]/60 ltr:right-5 rtl:left-5`}>A+</span>
              </div>

              {/* Chalk tray with a stick of chalk and a duster. */}
              <div aria-hidden className="absolute inset-x-10 -bottom-2.5 h-3 rounded-full bg-[#9c6026] shadow-[0_3px_0_rgba(0,0,0,.12),inset_0_1px_0_rgba(255,255,255,.25)]">
                <span className="absolute -top-1.5 h-2 w-9 rounded-full bg-[#fffdf2] ltr:left-8 rtl:right-8" />
                <span className="absolute -top-3 h-3.5 w-12 rounded-md bg-[#3f3f46] ltr:right-10 rtl:left-10">
                  <span className="absolute inset-x-0 bottom-0 h-1.5 rounded-b-md bg-[#d4d4d8]" />
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Partners, pinned up like photos on a classroom wall. */}
        <div id="partners" className="mt-20 scroll-mt-20 text-center sm:mt-24">
          <h3 className="font-fredoka text-xl font-semibold text-gray-900 sm:text-2xl">{txt.partnersLabel}</h3>
          <ul className="mt-9 flex flex-wrap items-start justify-center gap-x-12 gap-y-10">
            {PARTNERS.map((partner, i) => {
              const name = language === "ar" ? partner.nameAr : partner.name;
              return (
                <li key={partner.id}>
                  <a
                    href={partner.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={name}
                    className={`relative block bg-white p-3 pb-2 shadow-[0_16px_30px_-16px_rgba(15,23,42,.5)] ring-1 ring-black/5 transition-transform duration-300 hover:-translate-y-1 hover:rotate-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#007229] ${
                      i % 2 ? "rotate-2" : "-rotate-2"
                    }`}
                  >
                    <span
                      aria-hidden
                      className="absolute -top-2.5 left-1/2 z-10 h-5 w-5 -translate-x-1/2 rounded-full shadow-[0_3px_4px_rgba(0,0,0,.3)]"
                      style={{ background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,.7) 0 2px, ${PINS[i % PINS.length]} 3px)` }}
                    />
                    <span
                      className="flex h-28 w-56 items-center justify-center overflow-hidden sm:h-32 sm:w-64"
                      style={{ background: partner.logoBackground }}
                    >
                      <Image
                        src={partner.logo.src}
                        alt={name}
                        width={partner.logo.width}
                        height={partner.logo.height}
                        className={partner.logo.className}
                      />
                    </span>
                    <span className={`${hand} mt-1.5 block text-xl text-gray-700`}>{partner.shortName}</span>
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
