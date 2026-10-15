"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowUpRight, BookOpenCheck, CircleCheckBig, Users } from "lucide-react";
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
    partnersSubtitle: "Working together for Sudan's children.",
    visit: "Visit website",
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
    partnersSubtitle: "نعمل معاً من أجل أطفال السودان.",
    visit: "زيارة الموقع",
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

function StatTile({
  value,
  live,
  label,
  icon,
  tone,
  formatter,
}: {
  value: number;
  live: boolean;
  label: string;
  icon: React.ReactNode;
  tone: "green" | "amber" | "red";
  formatter: Intl.NumberFormat;
}) {
  // Live counts are shown exactly; fallback minimums are rounded with a "+".
  const target = live ? value : roundDownStat(value);
  const { ref, value: shown, bumps } = useAnimatedNumber(target);
  const featured = tone === "green";
  const toneClasses = {
    green: "bg-[#007229] text-white shadow-xl shadow-[#007229]/25",
    amber: "bg-[#fdf4e1] text-gray-900 ring-1 ring-amber-200/70",
    red: "bg-[#fdeef0] text-gray-900 ring-1 ring-red-200/70",
  }[tone];
  const iconClasses = {
    green: "bg-white/15 text-white",
    amber: "bg-amber-400/20 text-amber-600",
    red: "bg-[#D21034]/10 text-[#D21034]",
  }[tone];

  return (
    <li
      className={`relative overflow-hidden rounded-2xl p-4 sm:rounded-3xl sm:p-6 ${featured ? "col-span-2 sm:col-span-1" : ""} ${toneClasses}`}
    >
      {bumps > 0 && (
        <span
          key={bumps}
          aria-hidden
          className={`pointer-events-none absolute inset-0 animate-[stat-flash_1.4s_ease-out_both] rounded-[inherit] ${featured ? "bg-white/25" : "bg-white"}`}
        />
      )}
      {featured && (
        <svg aria-hidden className="pointer-events-none absolute -bottom-2 left-0 h-10 w-full" viewBox="0 0 300 40" preserveAspectRatio="none" fill="#00913D">
          <path d="M0 22c60-18 110-9 160 4s90 7 140-9v23H0z" />
        </svg>
      )}
      <div className="relative flex h-full flex-col">
        <span className={`mb-4 flex h-9 w-9 items-center justify-center rounded-xl sm:mb-6 sm:h-11 sm:w-11 ${iconClasses}`}>
          {icon}
        </span>
        <p className={`order-last mt-2 text-xs font-semibold leading-snug sm:text-sm ${featured ? "text-white/90" : "text-gray-600"}`}>
          {label}
        </p>
        <p ref={ref} className="font-fredoka text-4xl font-semibold leading-none tabular-nums sm:text-5xl">
          <span aria-hidden>
            {formatter.format(shown)}
            {!live && <span className={featured ? "text-amber-300" : "text-[#007229]"}>+</span>}
          </span>
          <span className="sr-only">
            {formatter.format(target)}
            {live ? "" : "+"}
          </span>
        </p>
      </div>
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

          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4">
            <StatTile
              value={stats.signups}
              live={stats.live}
              label={txt.stats.signups}
              tone="green"
              formatter={formatter}
              icon={<Users className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.2} />}
            />
            <StatTile
              value={stats.lessonsCompleted}
              live={stats.live}
              label={txt.stats.lessonsCompleted}
              tone="amber"
              formatter={formatter}
              icon={<BookOpenCheck className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.2} />}
            />
            <StatTile
              value={stats.practiceAttempts}
              live={stats.live}
              label={txt.stats.practiceAttempts}
              tone="red"
              formatter={formatter}
              icon={<CircleCheckBig className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.2} />}
            />
          </ul>
        </div>

        <div id="partners" className="mt-12 scroll-mt-20 rounded-3xl bg-gray-50 p-5 ring-1 ring-gray-100 sm:mt-16 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-10">
            <div className="text-center lg:w-56 lg:shrink-0 lg:text-start">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500">{txt.partnersLabel}</h3>
              <p className="mt-1.5 text-sm text-gray-600">{txt.partnersSubtitle}</p>
            </div>

            <ul className="grid flex-1 gap-3 sm:grid-cols-2 sm:gap-4">
              {PARTNERS.map((partner) => (
                <li key={partner.id}>
                  <a
                    href={partner.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200/80 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:ring-gray-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007229]"
                  >
                    <span
                      className="flex h-24 items-center justify-center px-6 sm:h-28"
                      style={{ backgroundColor: partner.logoBackground }}
                    >
                      <Image
                        src={partner.logo.src}
                        alt={`${partner.name} logo`}
                        width={partner.logo.width}
                        height={partner.logo.height}
                        className={partner.logo.className}
                      />
                    </span>
                    <span className="flex flex-1 items-start justify-between gap-3 border-t border-gray-100 p-4">
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-gray-900">
                          {language === "ar" ? partner.nameAr : partner.name}
                        </span>
                        <span className="mt-1 block text-xs leading-relaxed text-gray-500 sm:text-sm">
                          {language === "ar" ? partner.descriptionAr : partner.description}
                        </span>
                      </span>
                      <span className="sr-only">{txt.visit}</span>
                      <ArrowUpRight
                        aria-hidden
                        className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition-colors group-hover:text-[#007229] rtl:-scale-x-100"
                      />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
