"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { Language } from "@/contexts/LanguageContext";
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
function useLiveStats(initial: HomeStats) {
  const [stats, setStats] = useState(initial);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/public-stats", { cache: "no-store" });
        if (!response.ok) return;
        const next: unknown = await response.json();
        if (cancelled || !isHomeStats(next)) return;
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

// One figure in the stats row: the number, then what it counts.
function Stat({ value, live, label, formatter }: { value: number; live: boolean; label: string; formatter: Intl.NumberFormat }) {
  // Live counts are shown exactly; fallback minimums are rounded with a "+".
  const target = live ? value : roundDownStat(value);
  const { ref, value: shown, bumps } = useAnimatedNumber(target);

  return (
    <li className="px-3 py-5 first:ps-0 last:pe-0 sm:px-6 sm:py-6">
      <p ref={ref} className="font-fredoka text-3xl font-semibold leading-none tabular-nums text-gray-900 sm:text-5xl">
        {/* Re-keyed on each new count so the number briefly glows green. */}
        <span aria-hidden key={bumps} className={bumps > 0 ? "animate-[stat-tick_1.4s_ease-out]" : undefined}>
          {formatter.format(shown)}
          {!live && <span className="text-[#007229]">+</span>}
        </span>
        <span className="sr-only">
          {formatter.format(target)}
          {live ? "" : "+"}
        </span>
      </p>
      <p className="mt-2 text-xs leading-snug text-gray-500 sm:text-sm">{label}</p>
    </li>
  );
}

export function SocialProof({ stats: initialStats, language }: { stats: HomeStats; language: Language }) {
  const txt = copy[language];
  const stats = useLiveStats(initialStats);
  const formatter = statNumberFormat(language);

  return (
    <section aria-labelledby="social-proof-title" className="relative bg-white py-12 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.15fr] lg:items-center lg:gap-14">
          <div className="text-center lg:text-start">
            <h2
              id="social-proof-title"
              className="font-fredoka text-3xl font-semibold leading-tight text-gray-900 sm:text-4xl lg:text-5xl"
            >
              {txt.title}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-gray-600 sm:text-lg lg:mx-0">{txt.subtitle}</p>
          </div>

          <ul className="grid grid-cols-3 divide-x divide-gray-200 border-y border-gray-200 rtl:divide-x-reverse">
            <Stat value={stats.signups} live={stats.live} label={txt.stats.signups} formatter={formatter} />
            <Stat value={stats.lessonsCompleted} live={stats.live} label={txt.stats.lessonsCompleted} formatter={formatter} />
            <Stat value={stats.practiceAttempts} live={stats.live} label={txt.stats.practiceAttempts} formatter={formatter} />
          </ul>
        </div>

        <div id="partners" className="mt-14 scroll-mt-20 sm:mt-20">
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
