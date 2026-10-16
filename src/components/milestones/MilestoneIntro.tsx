"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Volume2, VolumeX, X } from "lucide-react";
import type { Lang, MilestoneIntroResponse } from "@/lib/milestones/types";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { ArenaBackdrop } from "@/components/characters";
import { MessageScreen, GREEN_BUTTON, TEXT_LINK } from "./BattleEndScreens";
import { NeedsInternetCard, OwlShieldIcon, SpeakerIcon } from "./BattleParts";
import { FitBoss, FitOwl } from "./Characters";
import { MilestoneApiError, milestoneApi, type Fetcher } from "./api";
import { bossName, formatNumber, MILESTONE_COPY, speakLine } from "./copy";
import { useBattleFeedback } from "./motion";
import { BOSS_TAUNTS } from "./signatures";

/**
 * Before the fight: meet the boss, see the weeks it covers and the shields
 * you get, then "Let's go!". Online only. Also the one place with the sound
 * switch, so the battle HUD stays to three things.
 */
export default function MilestoneIntro({ milestoneId, lang, fetcher, isOnline }: { milestoneId: string; lang: Lang; fetcher: Fetcher; isOnline: boolean }) {
  const t = MILESTONE_COPY[lang];
  const router = useRouter();
  const sounds = useBattleFeedback();
  const [intro, setIntro] = useState<MilestoneIntroResponse | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not_found" | "error">("loading");
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const load = useCallback(async () => {
    try {
      setIntro(await milestoneApi.intro((input, init) => fetcherRef.current(input, init), milestoneId, lang));
      setState("ready");
    } catch (error) {
      setState(error instanceof MilestoneApiError && error.status === 404 ? "not_found" : "error");
    }
  }, [lang, milestoneId]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const bossKey = intro?.milestone.bossKey ?? "puzzle_owlet";
  const level = intro?.milestone.level ?? 1;
  const boss = bossName(bossKey, lang, true);

  const shell = (children: React.ReactNode) => (
    <div
      dir={lang === "ar" ? "rtl" : "ltr"}
      lang={lang}
      className="fixed inset-0 z-[60] h-[100dvh] overflow-hidden bg-[#08361C] text-white"
      style={{ fontFamily: lang === "ar" ? "var(--font-cairo), var(--font-fredoka), sans-serif" : "var(--font-fredoka), system-ui, sans-serif" }}
    >
      <ArenaBackdrop bossKey={bossKey} className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0 bg-[#052814]/30" aria-hidden="true" />
      <div className="relative mx-auto h-full w-full max-w-[480px]" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        {children}
      </div>
    </div>
  );

  if (!isOnline) return shell(<div className="flex h-full items-center justify-center px-5"><NeedsInternetCard lang={lang} bossLabel={boss} /></div>);
  if (state === "loading") return shell(<MessageScreen lang={lang} bossKey={bossKey} level={level} title={t.loading} loading />);
  if (state !== "ready" || !intro) {
    return shell(
      <MessageScreen
        lang={lang}
        bossKey={bossKey}
        level={level}
        title={state === "not_found" ? t.notFound : t.somethingWrong}
        action={state === "error" ? { label: t.retry, onClick: () => void load() } : null}
      />
    );
  }

  const m = intro.milestone;
  const locked = intro.state === "locked" && !intro.preview;
  const passed = intro.state === "passed";
  const resuming = intro.state === "in_battle" || Boolean(intro.activeBattle);
  const line = locked
    ? t.lockedTitle(formatNumber(m.firstWeekNumber, lang), formatNumber(m.afterWeekNumber, lang))
    : passed
      ? t.introBeaten(boss)
      : resuming
        ? t.introAgain(boss)
        : BOSS_TAUNTS[bossKey][lang];
  const go = () => {
    trackAnalyticsEvent("milestone_start", {
      milestone_id: m.id,
      milestone_level: m.level,
      subject_id: m.subjectId,
      attempt_number: intro.attempts + (resuming ? 0 : 1),
      preview: intro.preview,
    });
    router.push(`/milestones/${m.id}/battle`);
  };

  return shell(
    <div className="flex h-full flex-col px-5 pb-6 pt-4">
      <header className="flex items-center justify-between">
        <Link href="/lessons" aria-label={t.backToLessons} title={t.backToLessons} className="grid h-14 w-14 place-items-center rounded-full bg-[#052814]/70 ring-1 ring-white/15">
          <X className="h-7 w-7" strokeWidth={3.2} aria-hidden="true" />
        </Link>
        <button
          type="button"
          onClick={sounds.toggleMuted}
          aria-pressed={sounds.muted}
          aria-label={sounds.muted ? t.soundOff : t.soundOn}
          title={sounds.muted ? t.soundOff : t.soundOn}
          className="grid h-14 w-14 place-items-center rounded-full bg-[#052814]/70 ring-1 ring-white/15"
        >
          {sounds.muted ? <VolumeX className="h-7 w-7" aria-hidden="true" /> : <Volume2 className="h-7 w-7" aria-hidden="true" />}
        </button>
      </header>

      <div className="mt-4 flex flex-col items-center text-center">
        <span className="rounded-full bg-[#F59E0B] px-4 py-1 text-[17px] font-bold text-[#3B1D00]">{t.bigChallenge}</span>
        <h1 className="mt-2 text-[clamp(34px,6dvh,44px)] font-bold uppercase leading-none tracking-wide [text-shadow:0_3px_0_rgba(0,0,0,0.35)]">{boss}</h1>
        <p className="mt-1 text-lg font-semibold text-[#FDE68A]">
          {(lang === "ar" ? intro.subjectNameAr : intro.subjectNameEn) ?? ""}
          {(lang === "ar" ? intro.subjectNameAr : intro.subjectNameEn) ? " · " : ""}
          {t.weeks(formatNumber(m.firstWeekNumber, lang), formatNumber(m.afterWeekNumber, lang))}
        </p>
      </div>

      {/* The boss says hello */}
      <div className="relative mt-4 flex flex-1 flex-col items-center justify-center">
        <div className="relative mb-3 flex max-w-[92%] items-center gap-2 rounded-[24px] bg-[#FFF8EC] py-3 pe-2.5 ps-4 text-[#1a1a1a] shadow-[0_6px_0_rgba(0,0,0,0.22)]">
          <p className="text-[clamp(20px,3dvh,24px)] font-bold leading-snug">{line}</p>
          <button
            type="button"
            onClick={() => speakLine(line, lang)}
            aria-label={t.listenTaunt}
            title={t.listenTaunt}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#F0FDF4] text-[#007229]"
          >
            <SpeakerIcon className="h-6 w-6" flip={lang === "ar"} />
          </button>
          <span className="absolute -bottom-3 left-1/2 h-0 w-0 -translate-x-1/2 border-x-[10px] border-t-[14px] border-x-transparent border-t-[#FFF8EC]" aria-hidden="true" />
        </div>
        <FitBoss bossKey={bossKey} pose={locked ? "sleep" : passed ? "ko" : "taunt"} enter={!locked} title={bossName(bossKey, lang)} className="h-[clamp(160px,28dvh,240px)] w-[clamp(160px,28dvh,240px)]" />
      </div>

      {/* Shields you get, then go */}
      <div className="flex items-end gap-3">
        <FitOwl pose={locked ? "think" : "idle"} glow={!locked} className="aspect-square h-[min(15dvh,28vw,124px)] shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          {!locked && (
            <span className="flex items-center gap-1 self-start rounded-full bg-[#052814]/70 px-3 py-1.5 ring-1 ring-white/15" role="img" aria-label={t.shieldsCount(formatNumber(m.heartsTotal, lang))}>
              {Array.from({ length: m.heartsTotal }, (_, i) => (
                <OwlShieldIcon key={i} className="h-7 w-7" />
              ))}
              <span className="ms-1 text-base font-bold">{t.toWin(formatNumber(m.requiredCorrect, lang), formatNumber(m.questionCount, lang))}</span>
            </span>
          )}
          {locked ? (
            intro.blockLessons[0] && (
              <Link href={`/lessons/${intro.blockLessons[0].lessonId}`} className={GREEN_BUTTON}>
                {t.practiseLessons}
              </Link>
            )
          ) : (
            <button type="button" onClick={go} className={GREEN_BUTTON}>
              {resuming ? t.continue : passed ? t.playAgain : t.start}
            </button>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4">
        {passed && intro.certificate && (
          <Link href={`/certificates/${intro.certificate.id}`} className={TEXT_LINK}>
            {t.seeCertificate}
          </Link>
        )}
        {!locked && intro.blockLessons[0] && (
          <Link href={`/lessons/${intro.blockLessons[0].lessonId}`} className={TEXT_LINK}>
            {t.practiseLessons}
          </Link>
        )}
      </div>
    </div>
  );
}
