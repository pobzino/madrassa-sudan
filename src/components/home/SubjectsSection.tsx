"use client";

import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Language } from "@/contexts/LanguageContext";
import { LivingOwl, type OwlBadge } from "@/components/brand/LivingOwl";

const copy = {
  en: {
    title: "Pick your favourite subject",
    worlds: [
      { name: "Maths", desc: "Solve problems. Build skills. Have fun!", cta: "Start Maths" },
      { name: "English", desc: "Read, write and explore the world of words!", cta: "Start English" },
    ],
  },
  ar: {
    title: "اختر مادتك المفضلة",
    worlds: [
      { name: "الرياضيات", desc: "حل المسائل. كوّن مهاراتك. استمتع!", cta: "ابدأ الرياضيات" },
      { name: "اللغة الإنجليزية", desc: "اقرأ واكتب واستكشف عالم الكلمات!", cta: "ابدأ الإنجليزية" },
    ],
  },
};

type World = {
  badge: OwlBadge;
  background: string;
  paper: string;
  accent: string;
  /** Light pad under the owl, for worlds whose colour is close to the owl's own red. */
  owlPad: string;
  symbols: { text: string; x: number; y: number; size: number; tilt: number; delay: number }[];
};

const WORLDS: World[] = [
  {
    badge: "math",
    background: "linear-gradient(150deg, #0b8a3e 0%, #007229 45%, #04501f 100%)",
    // Squared maths paper.
    paper: "linear-gradient(rgba(255,255,255,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.07) 1px, transparent 1px)",
    accent: "#007229",
    owlPad: "bg-black/20",
    symbols: [
      { text: "+", x: 68, y: 7, size: 54, tilt: -10, delay: 0 },
      { text: "÷", x: 87, y: 4, size: 44, tilt: 12, delay: 0.8 },
      { text: "×", x: 77, y: 28, size: 38, tilt: 8, delay: 1.6 },
      { text: "7", x: 92, y: 30, size: 50, tilt: -6, delay: 0.4 },
      { text: "=", x: 67, y: 42, size: 36, tilt: 0, delay: 1.2 },
      { text: "3", x: 84, y: 50, size: 30, tilt: 14, delay: 2 },
      { text: "%", x: 72, y: 62, size: 34, tilt: -14, delay: 2.4 },
    ],
  },
  {
    badge: "english",
    // The brand reds (the owl's own palette), pairing with the green Maths world.
    background: "linear-gradient(150deg, #e8334f 0%, #D21034 45%, #a01028 100%)",
    // Lined exercise-book paper.
    paper: "linear-gradient(rgba(255,255,255,.09) 1px, transparent 1px)",
    accent: "#D21034",
    owlPad: "bg-white/25",
    symbols: [
      { text: "A", x: 68, y: 6, size: 54, tilt: -8, delay: 0 },
      { text: "b", x: 87, y: 4, size: 46, tilt: 10, delay: 0.8 },
      { text: "C", x: 77, y: 28, size: 40, tilt: -12, delay: 1.6 },
      { text: "?", x: 92, y: 31, size: 48, tilt: 8, delay: 0.4 },
      { text: "Hi!", x: 66, y: 42, size: 30, tilt: -4, delay: 1.2 },
      { text: "z", x: 85, y: 50, size: 32, tilt: 12, delay: 2 },
      { text: "!", x: 73, y: 62, size: 36, tilt: -10, delay: 2.4 },
    ],
  },
];

function tilt(event: ReactPointerEvent<HTMLAnchorElement>) {
  if (event.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const card = event.currentTarget;
  const box = card.getBoundingClientRect();
  const x = (event.clientX - box.left) / box.width - 0.5;
  const y = (event.clientY - box.top) / box.height - 0.5;
  card.style.transform = `perspective(1000px) rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 8).toFixed(2)}deg) translateY(-6px)`;
}

/**
 * The two subjects as little worlds at golden hour: floating symbols, a
 * living owl that gets excited when you come close, and a gentle 3D tilt.
 * The sky fades down into the dusk meadow of the next section.
 */
export function SubjectsSection({ language, isRtl }: { language: Language; isRtl: boolean }) {
  const txt = copy[language];
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <section
      className="relative overflow-hidden pb-36 pt-16 sm:pb-44 sm:pt-24"
      style={{ background: "linear-gradient(180deg, #eef7ef 0%, #fff8ec 35%, #ffefdb 70%, #fde6cf 100%)" }}
    >
      {/* Warm sun glow and soft clouds. */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-16 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full sm:bottom-10"
        style={{ background: "radial-gradient(circle, rgba(255,232,150,.75) 0%, rgba(255,214,140,.35) 40%, rgba(255,214,140,0) 70%)" }}
      />
      <svg aria-hidden className="pointer-events-none absolute left-0 top-10 h-24 w-full opacity-80" viewBox="0 0 1000 100" preserveAspectRatio="xMidYMin slice" fill="#fff8ef">
        <g><ellipse cx="150" cy="50" rx="70" ry="20" /><ellipse cx="205" cy="58" rx="46" ry="16" /></g>
        <g opacity="0.8"><ellipse cx="820" cy="40" rx="62" ry="18" /><ellipse cx="870" cy="48" rx="40" ry="14" /></g>
      </svg>

      {/* Soft hills, fading into the next section's meadow. */}
      <svg aria-hidden className="pointer-events-none absolute bottom-0 left-0 h-[150px] w-full sm:h-[190px]" viewBox="0 0 1440 190" preserveAspectRatio="none">
        <path d="M0 70C220 20 420 30 640 70S1060 120 1260 70 1400 40 1440 50V190H0Z" fill="#fbe2d4" />
        <path d="M0 110C260 70 520 80 760 112S1200 150 1440 100V190H0Z" fill="#dcefdd" />
        <path d="M0 150C300 118 560 124 800 146S1240 170 1440 140V190H0Z" fill="#cfe6d3" />
      </svg>

      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="text-center font-fredoka text-3xl font-semibold text-gray-900 sm:text-4xl md:text-5xl">{txt.title}</h2>

        <div className="mt-10 grid gap-5 sm:mt-14 sm:gap-7 md:grid-cols-2">
          {WORLDS.map((world, i) => {
            const content = txt.worlds[i];
            return (
              <Link
                key={world.badge}
                href="/auth/signup"
                data-analytics="signup_click"
                data-analytics-source="subject_card"
                onPointerEnter={() => setHovered(i)}
                onPointerLeave={(event) => {
                  setHovered(null);
                  event.currentTarget.style.transform = "";
                }}
                onPointerMove={tilt}
                onFocus={() => setHovered(i)}
                onBlur={() => setHovered(null)}
                className="group relative block min-h-[260px] overflow-hidden rounded-[2rem] p-6 text-white shadow-[0_30px_60px_-20px_rgba(15,23,42,.35)] transition-transform duration-200 ease-out focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white sm:min-h-[340px] sm:p-9"
                style={{ background: world.background }}
              >
                <span aria-hidden className="absolute inset-0" style={{ backgroundImage: world.paper, backgroundSize: "28px 28px" }} />
                <span aria-hidden className="absolute inset-0 bg-[radial-gradient(70%_60%_at_80%_20%,rgba(255,255,255,.18),transparent_70%)]" />

                {world.symbols.map((symbol, k) => (
                  <span
                    key={k}
                    aria-hidden
                    className="absolute font-fredoka font-bold leading-none text-white/20 transition-colors duration-300 animate-[subject-float_5s_ease-in-out_infinite] group-hover:text-white/40 motion-reduce:animate-none"
                    style={
                      {
                        [isRtl ? "right" : "left"]: `${symbol.x}%`,
                        top: `${symbol.y}%`,
                        fontSize: symbol.size,
                        animationDelay: `${symbol.delay}s`,
                        "--tilt": `${symbol.tilt}deg`,
                      } as CSSProperties
                    }
                  >
                    {symbol.text}
                  </span>
                ))}

                {/* A little hill for the owl to stand on. */}
                <span aria-hidden className={`absolute -bottom-10 h-28 w-56 rounded-[50%] ltr:-right-6 rtl:-left-6 sm:w-72 ${world.owlPad}`} />
                {/* A soft halo so the red owl stands out on the red world. */}
                {world.badge === "english" && (
                  <span
                    aria-hidden
                    className="absolute bottom-0 h-40 w-40 rounded-full ltr:-right-2 rtl:-left-2 sm:h-56 sm:w-56"
                    style={{ background: "radial-gradient(circle, rgba(255,255,255,.4) 0%, rgba(255,255,255,0) 68%)" }}
                  />
                )}

                <div className="relative z-10 flex h-full max-w-[62%] flex-col">
                  <h3 className="font-fredoka text-4xl font-semibold leading-none sm:text-5xl">{content.name}</h3>
                  <p className="mt-3 text-base leading-relaxed text-white/85 sm:text-lg">{content.desc}</p>
                  <span
                    className="mt-6 inline-flex w-fit items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold shadow-lg transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1 sm:mt-auto sm:text-base"
                    style={{ color: world.accent }}
                  >
                    {content.cta}
                    <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
                  </span>
                </div>

                <div aria-hidden className="absolute bottom-2 w-28 ltr:right-3 rtl:left-3 sm:bottom-3 sm:w-40">
                  <LivingOwl
                    badge={world.badge}
                    mood={hovered === i ? "excited" : "idle"}
                    restGaze={{ x: isRtl ? 0.7 : -0.7, y: -0.3 }}
                    className="w-full"
                  />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
