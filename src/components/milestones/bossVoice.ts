import type { Lang } from "@/lib/milestones/types";
import { speakLine } from "./copy";

/**
 * Plays one recorded boss line (public/audio/boss/...), falling back to the
 * phone's own voice when the file is missing or blocked. Only one line plays
 * at a time: a new one stops the last. Resolves with how long the mouth should
 * move, in ms, as soon as that is known.
 */
let current: HTMLAudioElement | null = null;

export function stopBossVoice() {
  if (current) {
    current.pause();
    current.src = "";
    current = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

export function speakBossLine(line: { url: string; text: string }, lang: Lang, muted: boolean): Promise<number> {
  const estimate = Math.min(4000, Math.max(1000, line.text.length * 65));
  if (muted || typeof window === "undefined") return Promise.resolve(estimate);
  stopBossVoice();
  return new Promise((resolve) => {
    let settled = false;
    const done = (ms: number) => {
      if (settled) return;
      settled = true;
      resolve(ms);
    };
    const fallback = () => {
      current = null;
      speakLine(line.text, lang);
      done(estimate);
    };
    try {
      const audio = new Audio(line.url);
      current = audio;
      audio.preload = "auto";
      audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : estimate);
      audio.onerror = fallback;
      audio.onended = () => {
        if (current === audio) current = null;
      };
      audio.play().then(() => done(Number.isFinite(audio.duration) && audio.duration > 0 ? Math.round(audio.duration * 1000) : estimate)).catch(fallback);
    } catch {
      fallback();
    }
  });
}
