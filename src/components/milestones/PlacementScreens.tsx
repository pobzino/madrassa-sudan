"use client";

import Link from "next/link";
import ConfettiBurst from "@/components/practice/ConfettiBurst";
import type { SkillChip } from "@/lib/measurement/types";
import type { BossKey, Lang } from "@/lib/milestones/types";
import { GREEN_BUTTON, TEXT_LINK } from "./BattleEndScreens";
import { LetterIcon, PartyIcon, SproutIcon, StarIcon } from "@/components/icons/AmalIcons";
import { FitBoss, FitOwl } from "./Characters";
import { bossName, formatNumber, MILESTONE_COPY } from "./copy";

/**
 * "Meet your first boss": the placement's own screens. Warm and simple, never
 * a test: no tries, no numbers, no right or wrong, no certificate.
 */

/** Before the first puzzle: the boss says hello; the child can play now or later. */
export function PlacementIntroScreen({
  lang,
  bossKey,
  questionCount,
  starting,
  isOnline,
  preview,
  onPlay,
  onLater,
}: {
  lang: Lang;
  bossKey: BossKey;
  questionCount: number;
  starting: boolean;
  isOnline: boolean;
  preview: boolean;
  onPlay: () => void;
  onLater: () => void;
}) {
  const t = MILESTONE_COPY[lang];
  const boss = bossName(bossKey, lang, true);
  return (
    <div className="relative flex h-full flex-col items-center gap-4 overflow-y-auto px-6 pb-6 pt-10 text-center">
      <h1 className="text-[clamp(34px,6dvh,46px)] font-bold leading-[1.05] [text-shadow:0_3px_0_rgba(0,0,0,0.35)]">{t.placementIntroTitle(boss)}</h1>
      <div className="relative flex w-full items-end justify-center" aria-hidden="true">
        <FitBoss bossKey={bossKey} pose="happy" className="h-[clamp(150px,28dvh,240px)] w-[clamp(150px,28dvh,240px)]" />
        <FitOwl pose="cheer" className="-ms-6 mb-1 h-[clamp(96px,15dvh,136px)] w-[clamp(96px,15dvh,136px)] shrink-0" />
      </div>
      <p className="max-w-md rounded-[24px] bg-[#FFF8EC] px-5 py-4 text-[20px] font-bold leading-snug text-[#1a1a1a] shadow-[0_6px_0_rgba(0,0,0,0.22)]">
        {t.placementIntro(boss)}
      </p>
      <p className="rounded-full bg-[#052814]/70 px-4 py-1.5 text-base font-semibold ring-1 ring-white/15">
        {t.placementPuzzles(formatNumber(questionCount, lang))} · {t.placementNoRush}
      </p>
      {preview && <p className="rounded-[18px] bg-white/90 px-4 py-2 text-sm font-semibold text-[#1a1a1a]">{t.placementPreviewNote}</p>}
      <div className="mt-auto flex w-full max-w-sm flex-col gap-2 pt-3">
        <button type="button" onClick={onPlay} disabled={starting || !isOnline} className={GREEN_BUTTON}>
          {t.placementPlay}
        </button>
        <Link href="/lessons" onClick={onLater} className={TEXT_LINK}>
          {t.placementLater}
        </Link>
      </div>
    </div>
  );
}

function Chips({ skills, lang, tone }: { skills: SkillChip[]; lang: Lang; tone: "known" | "growing" }) {
  return (
    <ul className="flex flex-wrap justify-center gap-2">
      {skills.map((skill) => (
        <li
          key={skill.skillKey}
          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[17px] font-bold shadow-[0_3px_0_rgba(0,0,0,0.2)] ${
            tone === "known" ? "bg-[#FDE68A] text-[#3B1D00]" : "bg-white text-[#005C22]"
          }`}
        >
          {tone === "known" ? <StarIcon className="h-[1.1em] w-[1.1em] shrink-0" /> : <SproutIcon className="h-[1.1em] w-[1.1em] shrink-0" />}
          {lang === "ar" ? skill.familyLabelAr : skill.familyLabelEn}
        </li>
      ))}
    </ul>
  );
}

/** After the last puzzle: what the child already knows, what we'll learn together. */
export function PlacementEndScreen({
  lang,
  bossKey,
  burst,
  knownSkills,
  growingSkills,
  toldGrownUp,
  preview,
}: {
  lang: Lang;
  bossKey: BossKey;
  burst: number;
  knownSkills: SkillChip[];
  growingSkills: SkillChip[];
  toldGrownUp: boolean;
  preview: boolean;
}) {
  const t = MILESTONE_COPY[lang];
  const boss = bossName(bossKey, lang, true);
  return (
    <>
      <ConfettiBurst burst={burst} big originY={0.3} />
      <div className="relative flex h-full flex-col items-center gap-3 overflow-y-auto px-5 pb-6 pt-8 text-center">
        <h1 className="text-[clamp(32px,5.6dvh,44px)] font-bold leading-[1.05] [text-shadow:0_3px_0_rgba(0,0,0,0.35)]">
          {t.placementDoneTitle(boss)} <PartyIcon className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em] [filter:drop-shadow(0_3px_0_rgba(0,0,0,0.35))]" />
        </h1>
        <div className="relative flex w-full items-end justify-center" aria-hidden="true">
          <FitBoss bossKey={bossKey} pose="happy" className="h-[clamp(120px,21dvh,200px)] w-[clamp(120px,21dvh,200px)]" />
          <FitOwl pose="cheer" className="-ms-5 mb-1 h-[clamp(84px,13dvh,124px)] w-[clamp(84px,13dvh,124px)] shrink-0" />
        </div>
        <p className="text-[21px] font-semibold leading-snug">{t.placementKnowsYou(boss)}</p>
        {knownSkills.length > 0 && (
          <section className="flex w-full max-w-md flex-col gap-2" aria-label={t.placementKnown}>
            <h2 className="text-lg font-bold text-[#FDE68A]">{t.placementKnown}</h2>
            <Chips skills={knownSkills} lang={lang} tone="known" />
          </section>
        )}
        {growingSkills.length > 0 && (
          <section className="flex w-full max-w-md flex-col gap-2" aria-label={t.placementGrowing}>
            <h2 className="text-lg font-bold text-[#D1FAE5]">{t.placementGrowing}</h2>
            <Chips skills={growingSkills} lang={lang} tone="growing" />
          </section>
        )}
        <div className="mt-auto flex w-full max-w-sm flex-col gap-2 pt-3">
          {preview && <p className="rounded-[20px] bg-white/90 px-4 py-3 text-base font-semibold text-[#1a1a1a]">{t.placementPreviewNote}</p>}
          {toldGrownUp && (
            <p className="inline-flex items-center justify-center gap-1.5 text-lg font-semibold">
              {t.placementToldGrownUp} <LetterIcon className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" />
            </p>
          )}
          <Link href="/lessons" className={GREEN_BUTTON}>
            {t.placementStartPath}
          </Link>
        </div>
      </div>
    </>
  );
}

/** Already met (a second visit, another tab): kind, and back to the path. */
export function PlacementDoneScreen({ lang, bossKey }: { lang: Lang; bossKey: BossKey }) {
  const t = MILESTONE_COPY[lang];
  const boss = bossName(bossKey, lang, true);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="flex items-end justify-center" aria-hidden="true">
        <FitBoss bossKey={bossKey} pose="happy" className="h-44 w-44" />
        <FitOwl pose="cheer" className="-ms-4 h-28 w-28 shrink-0" />
      </div>
      <h1 className="max-w-sm text-[30px] font-bold leading-tight">
        {t.placementAlreadyMet(boss)} <PartyIcon className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" />
      </h1>
      <p className="text-[20px] font-semibold">{t.placementAlreadyMetSub}</p>
      <div className="flex w-full max-w-sm flex-col gap-3">
        <Link href="/lessons" className={GREEN_BUTTON}>
          {t.placementBackToPath}
        </Link>
      </div>
    </div>
  );
}
