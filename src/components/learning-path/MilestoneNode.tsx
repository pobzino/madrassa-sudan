"use client";

import { BossCharacter, type CharacterPose } from "@/components/milestones/Characters";
import { bossName, formatNumber } from "@/components/milestones/copy";
import type { TreeMilestone } from "@/lib/lessons/useLearningPath";

/**
 * The Big Challenge node on the learning path: the boss itself, in the tree's
 * own disc style and the same footprint as a lesson node.
 *  - locked: asleep and greyed behind a small lock
 *  - available: awake, peeking over a gold disc with a gentle bob
 *  - in battle: a bandage and a little health pip
 *  - passed: the knocked-out sticker, gold ring and the stars kept
 *  - needs internet: greyed with a wifi-off badge
 */
const COPY = {
  en: {
    title: "Big Challenge",
    locked: (a: string, b: string) => `Finish weeks ${a}–${b} first`,
    meet: (boss: string) => `Meet ${boss}`,
    toWin: (r: string, n: string) => `${r} of ${n} to win`,
    passed: "You won! ⭐",
    offline: "Needs internet",
    battle: "Battle!",
    continue: "Continue",
    bossBook: "Boss Book",
  },
  ar: {
    title: "التحدي الكبير",
    locked: (a: string, b: string) => `أكمل الأسابيع ${a}–${b} أولاً`,
    meet: (boss: string) => `تعرّف على ${boss}`,
    toWin: (r: string, n: string) => `${r} من ${n} للفوز`,
    passed: "فزت! ⭐",
    offline: "يحتاج إلى إنترنت",
    battle: "إلى المعركة!",
    continue: "أكمل",
    bossBook: "كتاب الوحوش",
  },
} as const;

export function milestoneLabel(m: TreeMilestone, lang: "ar" | "en", isOnline: boolean) {
  const t = COPY[lang];
  const sub =
    m.state === "passed"
      ? t.passed
      : !isOnline
        ? t.offline
        : m.state === "locked"
          ? t.locked(formatNumber(m.firstWeekNumber, lang), formatNumber(m.afterWeekNumber, lang))
          : `${t.meet(bossName(m.bossKey, lang, true))} · ${t.toWin(formatNumber(m.requiredCorrect, lang), formatNumber(m.questionCount, lang))}`;
  return { title: t.title, sub, muted: m.state === "locked" || (!isOnline && m.state !== "passed") };
}

export function milestoneCta(m: TreeMilestone, lang: "ar" | "en"): string {
  const t = COPY[lang];
  return m.state === "passed" ? t.bossBook : m.state === "in_battle" ? t.continue : t.battle;
}

/** Passed: the Boss Book card. Open and online: the challenge. Otherwise nothing to open. */
export function milestoneHref(m: TreeMilestone, isOnline: boolean): string | null {
  if (m.state === "passed") return `/boss-book#${m.bossKey}`;
  if ((m.state === "available" || m.state === "in_battle") && isOnline) return `/milestones/${m.id}`;
  return null;
}

const STAR_PATH = "M12 2.5 l2.9 6 6.6 .8 -4.9 4.6 1.3 6.5 -5.9 -3.3 -5.9 3.3 1.3 -6.5 -4.9 -4.6 6.6 -.8 z";

export function MilestoneDisc({ milestone, isCurrent, isOnline }: { milestone: TreeMilestone; isCurrent: boolean; isOnline: boolean }) {
  const { state, bossKey, level } = milestone;
  const passed = state === "passed";
  const locked = state === "locked";
  const greyed = locked || (!isOnline && !passed);
  const pose: CharacterPose = passed ? "ko" : locked ? "sleep" : state === "in_battle" ? "hit" : "idle";
  return (
    <div className="relative h-[72px] w-[72px]">
      <div
        className={`absolute inset-0 rounded-full border-b-4 shadow-md ${
          greyed
            ? "border-slate-400 bg-gradient-to-b from-slate-100 to-slate-300"
            : passed
              ? "border-amber-600 bg-gradient-to-b from-amber-200 to-amber-400 ring-4 ring-amber-300"
              : "border-amber-600 bg-gradient-to-b from-amber-300 to-amber-500"
        } ${isCurrent ? "ring-4 ring-amber-300/60" : ""}`}
      />
      {/* the boss peeks over the top of its disc */}
      <div className={`absolute -top-[30%] left-1/2 h-[104%] w-[104%] -translate-x-1/2 ${state === "available" && isOnline ? "motion-safe:[animation:float_3s_ease-in-out_infinite]" : ""}`}>
        <BossCharacter
          bossKey={bossKey}
          pose={pose}
          level={level}
          className={`h-full w-full ${greyed ? "[filter:grayscale(1)_opacity(0.55)]" : ""}`}
        />
      </div>
      {state === "in_battle" && (
        <>
          {/* a bandage and the boss's health pip */}
          <span className="absolute left-[22%] top-[6%] h-2.5 w-7 rotate-[-25deg] rounded-sm bg-white shadow-sm ring-1 ring-rose-200" aria-hidden="true" />
          <span className="absolute -bottom-1 left-1/2 h-2 w-12 -translate-x-1/2 overflow-hidden rounded-full bg-black/25" aria-hidden="true">
            <span className="block h-full w-1/2 rounded-full bg-[#D21034]" />
          </span>
        </>
      )}
      {locked && (
        <span className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-slate-500 text-white shadow-sm" aria-hidden="true">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </span>
      )}
      {!isOnline && !passed && !locked && (
        <span className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-sky-700 text-white shadow-sm" aria-hidden="true">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
            <path d="M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0M4 3l16 18" />
          </svg>
        </span>
      )}
      {passed && milestone.stars && (
        <span className="absolute -bottom-3 left-1/2 flex -translate-x-1/2 rounded-full bg-white px-1 py-0.5 shadow-sm" aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <svg key={n} viewBox="0 0 24 24" className="h-3.5 w-3.5">
              <path d={STAR_PATH} fill={n <= (milestone.stars ?? 0) ? "#F59E0B" : "#E5E7EB"} />
            </svg>
          ))}
        </span>
      )}
    </div>
  );
}
