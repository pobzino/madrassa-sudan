"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import type { BossKey, Lang } from "@/lib/milestones/types";
import { MILESTONE_COPY, speakLine } from "./copy";
import { splitMath } from "./mathText";

/** The palette of the owner's designs. */
export const UI = {
  sand: "#FFF6E9",
  ink: "#2B2A4C",
  muted: "#5E596E",
  line: "#E7DCCB",
  track: "#EADFCF",
  teal: "#0E7C7B",
  tealDark: "#0A5958",
  tealSoft: "#E3F2F1",
  star: "#F5A524",
} as const;

/* ------------------------------------------------------------------ */
/* Owl shields: the tries left.                                         */
/* ------------------------------------------------------------------ */

export function OwlShieldIcon({ className = "", empty = false }: { className?: string; empty?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 2.4 L20 5.2 V11.2 C20 16 16.6 19.6 12 21.6 C7.4 19.6 4 16 4 11.2 V5.2 Z"
        fill={empty ? "rgba(255,255,255,0.18)" : "#007229"}
        stroke={empty ? "rgba(255,255,255,0.55)" : "#005C22"}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      {!empty && (
        <>
          <circle cx={9.6} cy={10.4} r={2.3} fill="#FFFFFF" />
          <circle cx={14.4} cy={10.4} r={2.3} fill="#FFFFFF" />
          <circle cx={9.9} cy={10.7} r={1.1} fill={UI.ink} />
          <circle cx={14.7} cy={10.7} r={1.1} fill={UI.ink} />
          <path d="M11 13.4 L13 13.4 L12 15 Z" fill={UI.star} />
          <path d="M7.6 6.8 L9 8.4 M16.4 6.8 L15 8.4" stroke="#FFFFFF" strokeWidth={1.3} strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* The thing the boss throws on a block turn, and the owl's shield.     */
/* ------------------------------------------------------------------ */

export function Projectile({ bossKey, big }: { bossKey: BossKey; big: boolean }) {
  const glyph: Record<BossKey, string> = {
    number_giant: "7",
    word_dragon: "B",
    letter_camel: "ح",
    sprout_buddy: "",
    puzzle_owlet: "",
    letter_dragon: "ب",
  };
  const size = big ? 64 : 46;
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" overflow="visible">
      {big && (
        <>
          <circle cx={6} cy={10} r={5} fill="#FFFFFF" stroke="#F3C4CF" strokeWidth={1.5} />
          <circle cx={42} cy={6} r={4} fill="#FFFFFF" stroke="#F3C4CF" strokeWidth={1.5} />
        </>
      )}
      {bossKey === "sprout_buddy" ? (
        <>
          <ellipse cx={24} cy={26} rx={13} ry={16} fill="#C98B4E" stroke="#A86F37" strokeWidth={2} />
          <path d="M24 10 C20 4 14 6 14 8 C18 12 22 12 24 10Z" fill="#7ED957" />
          <circle cx={20} cy={24} r={2} fill="#FFFFFF" />
          <circle cx={28} cy={24} r={2} fill="#FFFFFF" />
          <path d="M20 31 q4 3 8 0" stroke={UI.ink} strokeWidth={1.8} fill="none" strokeLinecap="round" />
        </>
      ) : bossKey === "puzzle_owlet" ? (
        <path d="M10 14 h9 a5 5 0 1 1 10 0 h9 v9 a5 5 0 1 0 0 10 v9 h-28Z" fill="#5B9BF0" stroke="#3F7FD6" strokeWidth={2} strokeLinejoin="round" />
      ) : (
        <>
          <rect x={6} y={6} width={36} height={36} rx={10} fill={UI.star} stroke="#D98A0B" strokeWidth={2} />
          <text x={24} y={34} textAnchor="middle" fontSize={26} fontWeight={800} fill={UI.ink} fontFamily="system-ui, sans-serif">
            {glyph[bossKey]}
          </text>
        </>
      )}
    </svg>
  );
}

export function OwlShieldBubble({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 60" className={className} aria-hidden="true">
      <circle cx={30} cy={30} r={28} fill="rgba(240,253,244,0.7)" stroke="#00913D" strokeWidth={3} />
      <g transform="translate(12 10) scale(1.5)">
        <path d="M12 2.4 L20 5.2 V11.2 C20 16 16.6 19.6 12 21.6 C7.4 19.6 4 16 4 11.2 V5.2 Z" fill="#007229" stroke="#005C22" strokeWidth={1.2} />
        <circle cx={9.6} cy={10.4} r={2.3} fill="#FFFFFF" />
        <circle cx={14.4} cy={10.4} r={2.3} fill="#FFFFFF" />
        <circle cx={9.9} cy={10.7} r={1.1} fill={UI.ink} />
        <circle cx={14.7} cy={10.7} r={1.1} fill={UI.ink} />
        <path d="M11 13.4 L13 13.4 L12 15 Z" fill={UI.star} />
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Maths never breaks across lines ("7 + 5?" stays together).          */
/* ------------------------------------------------------------------ */

/** Text whose maths expressions never wrap inside themselves. */
export function MathText({ text }: { text: string }) {
  return (
    <>
      {splitMath(text).map((part, i) =>
        part.math ? (
          <span key={i} className="whitespace-nowrap">
            {part.text}
          </span>
        ) : (
          part.text
        )
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Read-aloud: the big speaker on every question.                       */
/* ------------------------------------------------------------------ */

type AudioStatus = "idle" | "loading" | "playing" | "error";

export function SpeakerIcon({ className = "", flip = false }: { className?: string; flip?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" style={flip ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M4 9.5 H8 L13 5 V19 L8 14.5 H4 Z" fill="currentColor" />
      <path d="M16.5 8.5 a5 5 0 0 1 0 7" stroke="currentColor" strokeWidth={2.2} fill="none" strokeLinecap="round" />
      <path d="M19 6 a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth={2.2} fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function ReadAloudButton({
  cacheKey,
  initialUrl,
  requestUrl,
  speechText,
  lang,
  size = "md",
  onSpeak,
}: {
  size?: "sm" | "md";
  /** Narration started; `ms` is how long it lasts (so a character can talk along). */
  onSpeak?: (ms: number) => void;
  /** Changes per question; resets the player. */
  cacheKey: string;
  initialUrl: string | null;
  /** Asks the server to narrate; resolves null when narration is off. */
  requestUrl: () => Promise<string | null>;
  /** Spoken by the phone's own voice when the server cannot narrate. */
  speechText: string;
  lang: Lang;
}) {
  const t = MILESTONE_COPY[lang];
  const [status, setStatus] = useState<AudioStatus>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlCache = useRef<Record<string, string>>({});

  const stop = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setStatus("idle");
  }, []);

  useEffect(() => stop, [cacheKey, stop]);

  const speakWithPhone = useCallback(() => {
    if (!speakLine(speechText, lang)) return false;
    // The phone's voice gives no length up front: about 70ms a character.
    onSpeak?.(Math.min(8000, Math.max(1200, speechText.length * 70)));
    setStatus("idle");
    return true;
  }, [lang, onSpeak, speechText]);

  const toggle = useCallback(async () => {
    if (status === "playing" || status === "loading") {
      stop();
      return;
    }
    setStatus("loading");
    try {
      let url: string | null = urlCache.current[cacheKey] ?? initialUrl;
      if (!url) {
        url = await requestUrl();
        if (url) urlCache.current[cacheKey] = url;
      }
      if (!url) {
        if (!speakWithPhone()) setStatus("error");
        return;
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onplay = () => {
        setStatus("playing");
        const seconds = Number.isFinite(audio.duration) ? audio.duration : speechText.length * 0.07;
        onSpeak?.(Math.min(12000, Math.max(800, seconds * 1000)));
      };
      audio.onended = () => {
        audioRef.current = null;
        setStatus("idle");
      };
      audio.onerror = () => {
        audioRef.current = null;
        if (!speakWithPhone()) setStatus("error");
      };
      await audio.play();
    } catch (error) {
      const blocked = error instanceof DOMException && error.name === "NotAllowedError";
      if (blocked) setStatus("idle");
      else if (!speakWithPhone()) setStatus("error");
    }
  }, [cacheKey, initialUrl, onSpeak, requestUrl, speakWithPhone, speechText.length, status, stop]);

  const busy = status === "playing" || status === "loading";
  return (
    <div className="flex shrink-0 flex-col items-center">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-label={busy ? t.stopListening : t.listenQuestion}
        title={busy ? t.stopListening : t.listenQuestion}
        className={`grid place-items-center rounded-full text-[#007229] transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#007229]/30 ${size === "sm" ? "h-12 w-12" : "h-14 w-14"}`}
        style={{ background: busy ? "#BBF7D0" : "#F0FDF4" }}
      >
        {status === "loading" ? <LoaderCircle className="h-6 w-6 animate-spin" aria-hidden="true" /> : <SpeakerIcon className="h-6 w-6" flip={lang === "ar"} />}
      </button>
      {status === "error" && <span className="mt-1 max-w-[5.5rem] text-center text-[11px] font-bold leading-tight text-[#5E596E]">{t.soundUnavailable}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Needs internet: milestones are online only.                          */
/* ------------------------------------------------------------------ */

export function WifiOffIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M2 8.5 a15 15 0 0 1 20 0" stroke="currentColor" strokeWidth={2} fill="none" strokeLinecap="round" />
      <path d="M5.5 12 a10 10 0 0 1 13 0" stroke="currentColor" strokeWidth={2} fill="none" strokeLinecap="round" />
      <path d="M9 15.5 a5 5 0 0 1 6 0" stroke="currentColor" strokeWidth={2} fill="none" strokeLinecap="round" />
      <circle cx={12} cy={19} r={1.6} fill="currentColor" />
      <path d="M4 3 L20 21" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

export function NeedsInternetCard({ lang, bossLabel, backHref = "/lessons" }: { lang: Lang; bossLabel: string; backHref?: string }) {
  const t = MILESTONE_COPY[lang];
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center rounded-[28px] bg-white px-6 py-7 text-center shadow-[0_4px_0_#EADFCF]">
      <div className="grid h-20 w-20 place-items-center rounded-full bg-[#F2EDE6] text-[#8C8698]">
        <WifiOffIcon className="h-11 w-11" />
      </div>
      <h2 className="mt-4 text-[28px] font-extrabold leading-tight">{t.needsInternetTitle}</h2>
      <p className="mt-2 text-lg font-semibold leading-snug text-[#4A4560]">{t.needsInternetBody(bossLabel)}</p>
      <div className="mt-6 flex w-full flex-col gap-3">
        {/* A full page load: the saved-lessons hub works with no connection. */}
        <a href="/offline" className="inline-flex h-16 items-center justify-center rounded-[22px] bg-[#0E7C7B] px-6 text-[22px] font-extrabold text-white shadow-[0_5px_0_#0A5958]">
          {t.savedLessons}
        </a>
        <Link href={backHref} className="inline-flex min-h-12 items-center justify-center px-6 text-[17px] font-bold text-[#0E6A69]">
          {t.backToLessons}
        </Link>
      </div>
    </div>
  );
}
