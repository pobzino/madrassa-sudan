"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Volume2, VolumeX, X } from "lucide-react";
import type { Lang, MilestoneIntroResponse } from "@/lib/milestones/types";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { ArenaBackdrop, BOSS_FOOT, OWL_FOOT, type PlacedAnchor } from "@/components/characters";
import AmalLoading from "@/components/AmalLoading";
import { MessageScreen, GREEN_BUTTON, TEXT_LINK } from "./BattleEndScreens";
import { useViewport } from "./BattleScene";
import { DESKTOP_BOSS_UNITS, DESKTOP_OWL_UNITS, layoutModeFor } from "./geometry";
import { NeedsInternetCard, OwlShieldIcon, SpeakerIcon } from "./BattleParts";
import { FitBoss, FitOwl } from "./Characters";
import { MilestoneApiError, type Fetcher } from "./api";
import { loadIntro, recallBoss, startBattleEarly } from "./prefetch";
import { bossName, formatNumber, MILESTONE_COPY, speakLine } from "./copy";
import { useBattleFeedback } from "./motion";
import { BOSS_TAUNTS } from "./signatures";

/**
 * Before the fight: meet the boss, see the weeks it covers and the shields
 * you get, then "Let's go!". Online only. Also the one place with the sound
 * switch, so the battle HUD stays to three things.
 */
const noSubscribe = () => () => undefined;

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
      setIntro(await loadIntro((input, init) => fetcherRef.current(input, init), milestoneId, lang));
      setState("ready");
    } catch (error) {
      setState(error instanceof MilestoneApiError && error.status === 404 ? "not_found" : "error");
    }
  }, [lang, milestoneId]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    // Warm the battle screen so Play opens it at once.
    router.prefetch(`/milestones/${milestoneId}/battle`);
    return () => window.clearTimeout(id);
  }, [load, milestoneId, router]);

  const viewport = useViewport();
  const desktop = layoutModeFor(viewport.width, viewport.height) === "desktop";
  const staged = !desktop && viewport.width > viewport.height;
  const rememberedBoss = useSyncExternalStore(noSubscribe, () => recallBoss(milestoneId), () => null);
  const bossKey = intro?.milestone.bossKey ?? rememberedBoss ?? "puzzle_owlet";
  const level = intro?.milestone.level ?? 1;
  const boss = bossName(bossKey, lang, true);

  // `cast` (desktop) stands the characters on the arena's own anchors.
  const shell = (children: React.ReactNode, cast?: (anchors: { boss: PlacedAnchor; owl: PlacedAnchor }) => React.ReactNode) => (
    <div
      dir={lang === "ar" ? "rtl" : "ltr"}
      lang={lang}
      className="fixed inset-0 z-[60] h-[100dvh] overflow-hidden bg-[radial-gradient(ellipse_at_center,#0B4A26,#04200F)] text-white"
      style={{ fontFamily: lang === "ar" ? "var(--font-cairo), var(--font-fredoka), sans-serif" : "var(--font-fredoka), system-ui, sans-serif" }}
    >
      {/* Phones and portrait tablets fill the screen; desktops get the landscape
          arena and a side-by-side layout; small landscape screens a centred stage. */}
      <div
        className={`relative mx-auto h-full overflow-hidden ${staged ? "shadow-[0_0_60px_rgba(0,0,0,0.45)]" : ""}`}
        style={{ width: staged ? "min(100vw, calc(100dvh * 0.62))" : "100%" }}
      >
        <ArenaBackdrop bossKey={bossKey} orientation={desktop ? "landscape" : "portrait"} className="absolute inset-0 h-full w-full">
          {cast}
        </ArenaBackdrop>
        {!cast && (
          <>
            <div className="absolute inset-0 bg-[#052814]/30" aria-hidden="true" />
            <div className="relative mx-auto h-full w-full" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
              {children}
            </div>
          </>
        )}
      </div>
    </div>
  );

  if (!isOnline) return shell(<div className="flex h-full items-center justify-center px-5"><NeedsInternetCard lang={lang} bossLabel={boss} /></div>);
  if (state === "loading") {
    return <AmalLoading fullScreen dir={lang === "ar" ? "rtl" : "ltr"} message={rememberedBoss ? t.gettingReady(boss) : t.loading} />;
  }
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
    // Start (or resume) the battle now, so the battle screen opens on it.
    void startBattleEarly((input, init) => fetcherRef.current(input, init), m.id, lang).catch(() => undefined);
    router.push(`/milestones/${m.id}/battle`);
  };

  const header = (
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
  );
  const subjectName = (lang === "ar" ? intro.subjectNameAr : intro.subjectNameEn) ?? "";
  const title = (
    <div className={`flex flex-col items-center text-center ${desktop ? "" : "mt-4"}`}>
      <span className={`rounded-full bg-[#F59E0B] px-4 py-1 font-bold text-[#3B1D00] ${desktop ? "text-[22px]" : "text-[17px]"}`}>{t.bigChallenge}</span>
      <h1 className={`mt-2 font-bold uppercase leading-none tracking-wide [text-shadow:0_3px_0_rgba(0,0,0,0.35)] ${desktop ? "text-[64px]" : "text-[clamp(34px,6dvh,44px)]"}`}>{boss}</h1>
      <p className={`mt-1 font-semibold text-[#FDE68A] ${desktop ? "text-2xl" : "text-lg"}`}>
        {subjectName}
        {subjectName ? " · " : ""}
        {t.weeks(formatNumber(m.firstWeekNumber, lang), formatNumber(m.afterWeekNumber, lang))}
      </p>
    </div>
  );
  // The boss says hello.
  const bubble = (
      <div className={`relative mb-3 flex items-center gap-2 rounded-[24px] bg-[#FFF8EC] py-3 pe-2.5 ps-4 text-[#1a1a1a] shadow-[0_6px_0_rgba(0,0,0,0.22)] ${desktop ? "max-w-[460px]" : "max-w-[92%]"}`}>
        <p className={`font-bold leading-snug ${desktop ? "text-[28px]" : "text-[clamp(20px,3dvh,24px)]"}`}>{line}</p>
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
  );
  const bossBlock = (
    <div className="relative mt-4 flex flex-1 flex-col items-center justify-center">
      {bubble}
      <FitBoss
        bossKey={bossKey}
        pose={locked ? "sleep" : passed ? "ko" : "taunt"}
        enter={!locked}
        title={bossName(bossKey, lang)}
        className="h-[clamp(160px,28dvh,240px)] w-[clamp(160px,28dvh,240px)]"
      />
    </div>
  );
  // Shields you get, then go.
  const goBlock = (
    <div className={`flex min-w-0 flex-1 flex-col gap-2.5 ${desktop ? "max-w-[440px]" : ""}`}>
      {!locked && (
        <span className="flex items-center gap-1 self-start rounded-full bg-[#052814]/70 px-3 py-1.5 ring-1 ring-white/15" role="img" aria-label={t.shieldsCount(formatNumber(m.heartsTotal, lang))}>
          {Array.from({ length: m.heartsTotal }, (_, i) => (
            <OwlShieldIcon key={i} className={desktop ? "h-9 w-9" : "h-7 w-7"} />
          ))}
          <span className={`ms-1 font-bold ${desktop ? "text-xl" : "text-base"}`}>{t.toWin(formatNumber(m.requiredCorrect, lang), formatNumber(m.questionCount, lang))}</span>
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
  );
  const links = (
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
  );
  const owl = <FitOwl pose={locked ? "think" : "idle"} glow={!locked} className="aspect-square h-[min(15dvh,28vw,124px)] shrink-0" />;

  if (desktop) {
    // As in the battle: the owl on its platform (left) with the button beside it,
    // the boss on its ledge (right) with its hello above.
    return shell(null, ({ boss: bossAt, owl: owlAt }) => {
      const bossSize = Math.round(DESKTOP_BOSS_UNITS * bossAt.scale);
      const owlSize = Math.round(DESKTOP_OWL_UNITS * owlAt.scale);
      const bossTop = bossAt.y - bossSize * BOSS_FOOT.y;
      return (
        <>
          <div className="absolute inset-0 bg-[#052814]/25" aria-hidden="true" />
          <div className="absolute inset-x-10 top-8">{header}</div>
          <div className="absolute inset-x-0 top-8">{title}</div>
          <div className="absolute" style={{ left: bossAt.x - bossSize * BOSS_FOOT.x, top: bossTop, width: bossSize, height: bossSize }}>
            <FitBoss bossKey={bossKey} pose={locked ? "sleep" : passed ? "ko" : "taunt"} enter={!locked} title={bossName(bossKey, lang)} className="h-full w-full" />
          </div>
          <div className="absolute flex -translate-x-1/2 -translate-y-full justify-center" style={{ left: Math.min(bossAt.x, viewport.width - 260), top: bossTop + bossSize * 0.06, width: 480 }}>
            {bubble}
          </div>
          <div className="absolute" style={{ left: owlAt.x - owlSize * OWL_FOOT.x, top: owlAt.y - owlSize * OWL_FOOT.y, width: owlSize, height: owlSize }}>
            <FitOwl pose={locked ? "think" : "idle"} glow={!locked} className="h-full w-full" />
          </div>
          <div className="absolute flex w-[420px] -translate-y-full flex-col" style={{ left: owlAt.x + owlSize * 0.6, top: owlAt.y - 8 }} dir={lang === "ar" ? "rtl" : "ltr"}>
            {goBlock}
            {links}
          </div>
        </>
      );
    });
  }

  return shell(
    <div className="flex h-full flex-col px-5 pb-6 pt-4">
      {header}
      {title}
      {bossBlock}
      <div className="flex items-end gap-3">
        {owl}
        {goBlock}
      </div>
      {links}
    </div>
  );
}
