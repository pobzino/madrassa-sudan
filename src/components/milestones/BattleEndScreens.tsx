"use client";

import Link from "next/link";
import { RotateCcw } from "lucide-react";
import ConfettiBurst from "@/components/practice/ConfettiBurst";
import LearnerAvatarIcon from "@/components/learners/LearnerAvatarIcon";
import type { LearnerAvatar } from "@/lib/learners/types";
import type { BossKey, Lang, MilestoneIntroResponse } from "@/lib/milestones/types";
import { FitBoss, FitOwl } from "./Characters";
import { bossName, formatNumber, MILESTONE_COPY } from "./copy";

const STAR_PATH = "M12 2.5 l2.9 6 6.6 .8 -4.9 4.6 1.3 6.5 -5.9 -3.3 -5.9 3.3 1.3 -6.5 -4.9 -4.6 6.6 -.8 z";

export const GREEN_BUTTON =
  "inline-flex h-16 w-full items-center justify-center gap-2 rounded-[22px] bg-[#007229] px-6 text-[24px] font-bold text-white shadow-[0_5px_0_#005C22] transition-transform active:translate-y-1 active:shadow-none disabled:opacity-50";
const WHITE_BUTTON =
  "inline-flex h-14 w-full items-center justify-center gap-2 rounded-[20px] bg-white px-6 text-xl font-bold text-[#007229] shadow-[0_4px_0_rgba(0,0,0,0.25)] disabled:opacity-50";
export const TEXT_LINK = "self-center px-3 py-2 text-[17px] font-semibold text-white/90 underline-offset-4 hover:underline";

/** Victory: the boss knocked out (cartoon-style), the owl celebrating, confetti. */
export function VictoryScreen({
  lang,
  bossKey,
  burst,
  stars,
  certificateId,
  firstPass,
  preview,
  learner,
}: {
  lang: Lang;
  bossKey: BossKey;
  level: number;
  burst: number;
  stars: 1 | 2 | 3 | null;
  certificateId: string | null;
  firstPass: boolean;
  preview: boolean;
  learner: { name: string; avatar: LearnerAvatar | null } | null;
}) {
  const t = MILESTONE_COPY[lang];
  const boss = bossName(bossKey, lang, true);
  return (
    <>
      <ConfettiBurst burst={burst} big originY={0.3} />
      <div className="relative flex h-full flex-col items-center gap-3 overflow-y-auto px-6 pb-6 pt-8 text-center">
        <h1 className="text-[clamp(34px,6dvh,44px)] font-bold leading-[1.05] [text-shadow:0_3px_0_rgba(0,0,0,0.35)]">{t.youBeat(boss)}</h1>
        <div className="relative flex w-full items-end justify-center" aria-hidden="true">
          <FitBoss bossKey={bossKey} pose="ko" className="h-[clamp(150px,27dvh,230px)] w-[clamp(150px,27dvh,230px)]" />
          <FitOwl pose="cheer" className="-ms-6 mb-1 h-[clamp(100px,16dvh,140px)] w-[clamp(100px,16dvh,140px)] shrink-0" />
        </div>
        <p className="text-[21px] font-semibold leading-snug">{t.tooClever(boss)}</p>
        {stars && (
          <div className="flex gap-1.5" role="img" aria-label={t.starsKept(`${formatNumber(stars, lang)}/${formatNumber(3, lang)}`)}>
            {[1, 2, 3].map((n) => (
              <svg key={n} viewBox="0 0 24 24" className="h-11 w-11 drop-shadow-[0_0_8px_rgba(245,158,11,0.7)]" aria-hidden="true">
                <path d={STAR_PATH} fill={n <= stars ? "#F59E0B" : "rgba(255,255,255,0.25)"} />
              </svg>
            ))}
          </div>
        )}
        {learner && (
          <div className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[#1a1a1a] shadow-[0_4px_0_rgba(0,0,0,0.25)]">
            {learner.avatar ? <LearnerAvatarIcon avatar={learner.avatar} className="h-9 w-9" /> : null}
            <span className="text-lg font-bold">{learner.name || t.you}</span>
          </div>
        )}
        <div className="mt-auto flex w-full max-w-sm flex-col gap-2 pt-3">
          {preview ? (
            <p className="rounded-[20px] bg-white/90 px-4 py-3 text-base font-semibold text-[#1a1a1a]">{t.previewNote}</p>
          ) : certificateId ? (
            <Link href={`/certificates/${certificateId}`} className={GREEN_BUTTON}>
              {t.seeCertificate}
            </Link>
          ) : null}
          {firstPass && <p className="text-lg font-semibold">{t.toldGrownUp}</p>}
          <Link href="/lessons" className={TEXT_LINK}>{t.backToLessons}</Link>
        </div>
      </div>
    </>
  );
}

/** Out of shields: kind, practise first, then try again. */
export function SoCloseScreen({
  lang,
  bossKey,
  blockLessons,
  isOnline,
  restarting,
  onPlayAgain,
}: {
  lang: Lang;
  bossKey: BossKey;
  level: number;
  blockLessons: MilestoneIntroResponse["blockLessons"];
  isOnline: boolean;
  restarting: boolean;
  onPlayAgain: () => void;
}) {
  const t = MILESTONE_COPY[lang];
  return (
    <div className="relative flex h-full flex-col items-center gap-3 overflow-y-auto px-6 pb-6 pt-8 text-center">
      <div className="flex w-full items-end justify-center" aria-hidden="true">
        <FitBoss bossKey={bossKey} pose="happy" className="h-[clamp(130px,23dvh,200px)] w-[clamp(130px,23dvh,200px)]" />
        <FitOwl pose="idle" className="-ms-3 h-[clamp(92px,15dvh,124px)] w-[clamp(92px,15dvh,124px)] shrink-0" />
      </div>
      <h1 className="text-[clamp(36px,6dvh,44px)] font-bold leading-none [text-shadow:0_3px_0_rgba(0,0,0,0.35)]">{t.soCloseTitle}</h1>
      <p className="text-[21px] font-semibold leading-snug">{t.practiseThenPlay}</p>
      {blockLessons.length > 0 && (
        <ul className="flex w-full max-w-sm flex-col gap-2">
          {blockLessons.slice(0, 4).map((lesson) => (
            <li key={lesson.lessonId}>
              <Link href={`/lessons/${lesson.lessonId}`} className="flex min-h-14 items-center gap-3 rounded-[18px] bg-white/95 px-3 text-start text-[#1a1a1a]">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#007229]">
                  <svg viewBox="0 0 24 24" className={`h-5 w-5 ${lang === "ar" ? "-scale-x-100" : ""}`} aria-hidden="true"><path d="M8 5 L19 12 L8 19 Z" fill="#FFFFFF" /></svg>
                </span>
                <span className="min-w-0 flex-1 truncate text-lg font-bold">{lesson.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex w-full max-w-sm flex-col gap-2.5 pt-3">
        {blockLessons.length > 0 && (
          <Link href={`/lessons/${blockLessons[0].lessonId}`} className={GREEN_BUTTON}>
            {t.practiseLessons}
          </Link>
        )}
        <button type="button" disabled={restarting || !isOnline} onClick={onPlayAgain} className={WHITE_BUTTON}>
          <RotateCcw className="h-5 w-5" aria-hidden="true" />
          {t.tryAgain}
        </button>
        <Link href="/lessons" className={TEXT_LINK}>{t.backToLessons}</Link>
      </div>
    </div>
  );
}

/** Loading, locked, not found, reset, error. */
export function MessageScreen({
  lang,
  bossKey,
  title,
  loading = false,
  action,
}: {
  lang: Lang;
  bossKey: BossKey;
  level: number;
  title: string;
  loading?: boolean;
  action?: { label: string; onClick: () => void; disabled?: boolean } | null;
}) {
  const t = MILESTONE_COPY[lang];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center" role={loading ? "status" : undefined}>
      <FitBoss bossKey={bossKey} pose={loading ? "idle" : "sleep"} className={`h-44 w-44 ${loading ? "motion-safe:animate-pulse" : ""}`} />
      <h1 className="max-w-sm text-[28px] font-bold leading-tight">{title}</h1>
      {!loading && (
        <div className="flex w-full max-w-sm flex-col gap-3">
          {action && (
            <button type="button" disabled={action.disabled} onClick={action.onClick} className={GREEN_BUTTON}>
              {action.label}
            </button>
          )}
          <Link href="/lessons" className={TEXT_LINK}>{t.backToLessons}</Link>
        </div>
      )}
    </div>
  );
}
