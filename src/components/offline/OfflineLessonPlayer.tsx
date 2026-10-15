"use client";

/**
 * The offline player (/offline/play?id=<lessonId>): plays a lesson saved on
 * this phone with no connection at all.
 *
 * Everything comes from the device: the lesson record (IndexedDB), the
 * narration (Cache Storage, played from a blob: URL — iPhone's media loader
 * would need byte-range responses from a service-worker URL) and the slide
 * images (the service worker answers their original URLs from the asset
 * cache). Identity is the owner record from getOwner(), never supabase.auth:
 * offline, an expired session makes auth calls retry for ~25 s and then
 * report no user. Progress and answers are saved on the phone and queued;
 * OfflineSyncRunner sends them when the connection returns.
 *
 * Links here are plain <a> (full page loads): a client-side navigation
 * would fetch an RSC payload that fails offline.
 */

import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CloudOff, Smartphone, TriangleAlert } from "lucide-react";
import SimPlayer from "@/components/slides/SimPlayer";
import { OwlConfused, OwlSad } from "@/components/illustrations";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScreenWakeLock } from "@/hooks/useScreenWakeLock";
import { OFFLINE_HUB_PATH, offlinePlayerUrl } from "@/lib/offline/cache-names";
import {
  getCachedSimAudio,
  onPrivateDataCleared,
  type OfflineLesson,
  type OfflineNeighbor,
} from "@/lib/offline/db";
import { AUDIO_FORMAT_WARNING } from "@/lib/offline/download-manager";
import { getOwnedOfflineLesson, getOwner } from "@/lib/offline/identity";
import { getCachedActiveLearnerId, selectCachedLearner } from "@/lib/offline/learner";
import {
  getSavedSlideResponses,
  queueSlideResponse,
  saveSlideResponseOffline,
  type SavedSlideResponses,
} from "@/lib/offline/slide-responses";
import { getEffectiveLessonProgress, queueLessonProgress, type ProgressValues } from "@/lib/offline/sync";
import { warmOfflinePlayerChunks } from "@/lib/offline/warm";
import type { SimPayload } from "@/lib/sim.types";
import { LanguageToggle } from "./LanguageToggle";
import { useOnlineStatus } from "./useOnlineStatus";
import {
  COMPLETION_PERCENT,
  contentLanguageFor,
  hasUnsavedProgress,
  lessonDurationSec,
  pickLocalized,
  positionForPercent,
  resumeVirtualMs,
  shouldSaveProgress,
  type ProgressCheckpoint,
} from "./helpers";

const COPY = {
  en: {
    back: "My saved lessons",
    loading: "Opening your lesson…",
    savedOnPhone: "Saved on this phone",
    finished: "Finished",
    grade: "Grade",
    notSavedTitle: "This lesson isn't saved on this phone",
    notSavedBody: "Save lessons while online to watch them here without internet.",
    incompleteTitle: "This download is incomplete",
    incompleteBody: "Connect to the internet and save it again.",
    errorTitle: "Saved lessons couldn't be opened",
    errorBody: "Something on this phone stopped Amal from reading them. Try again.",
    tryAgain: "Try again",
    openFullLesson: "Open the full lesson",
    practiceTitle: "Practice needs internet",
    practiceBody: "It'll be here when you're back online.",
    startPractice: "Start Practice",
    nextLesson: "Next lesson",
    storageProblem: "Your progress couldn't be saved on this phone. It may be full.",
    finishedNote: "Lesson finished. Saved on this phone.",
    oldCopyNote: "This lesson was saved by an older version of Amal. Save it again while online to get its pictures and see when it's finished.",
    crashTitle: "This lesson stopped playing",
    crashBody: "Something went wrong on this phone. Open it again.",
    openAgain: "Open it again",
  },
  ar: {
    back: "دروسي المحفوظة",
    loading: "جارٍ فتح درسك…",
    savedOnPhone: "محفوظ على هذا الهاتف",
    finished: "مكتمل",
    grade: "الصف",
    notSavedTitle: "هذا الدرس غير محفوظ على هذا الهاتف",
    notSavedBody: "احفظ الدروس وأنت متصل بالإنترنت لتشاهدها هنا بدون إنترنت.",
    incompleteTitle: "هذا التنزيل غير مكتمل",
    incompleteBody: "اتصل بالإنترنت واحفظه مرة أخرى.",
    errorTitle: "تعذّر فتح الدروس المحفوظة",
    errorBody: "منع شيء على هذا الهاتف آمال من قراءتها. حاول مرة أخرى.",
    tryAgain: "حاول مرة أخرى",
    openFullLesson: "افتح الدرس كاملاً",
    practiceTitle: "التدريب يحتاج إلى إنترنت",
    practiceBody: "سيكون هنا عندما تعود متصلاً بالإنترنت.",
    startPractice: "ابدأ التدريب",
    nextLesson: "الدرس التالي",
    storageProblem: "تعذّر حفظ تقدّمك على هذا الهاتف. ربما امتلأت مساحته.",
    finishedNote: "اكتمل الدرس. حُفظ على هذا الهاتف.",
    oldCopyNote: "حُفظ هذا الدرس بإصدار أقدم من آمال. احفظه مرة أخرى وأنت متصل بالإنترنت لتظهر صوره ويظهر إكماله.",
    crashTitle: "توقّف تشغيل هذا الدرس",
    crashBody: "حدث خطأ على هذا الهاتف. افتحه مرة أخرى.",
    openAgain: "افتحه مرة أخرى",
  },
} as const;

// Warming loads every activity chunk; let the lesson start first.
const WARM_DELAY_MS = 5_000;

const BRAND_BACKGROUND = "linear-gradient(180deg, #e4efff 0%, #eef0fb 30%, #eef6ee 65%, #dcefdd 100%)";

type PlayerState =
  | { status: "loading" }
  | { status: "not_downloaded" }
  | { status: "incomplete" }
  | { status: "error" }
  | {
      status: "ready";
      ownerId: string;
      learnerId: string;
      lesson: OfflineLesson;
      payload: SimPayload;
      savedResponses: SavedSlideResponses;
      progress: ProgressValues | null;
      next: OfflineNeighbor | null;
    };

/**
 * SimPlayer resumes from `sim-resume:<key>` in localStorage. The first time
 * this account plays the lesson on this phone there's no entry yet, so start
 * from where the saved progress says they got to (not when it's finished —
 * then the lesson starts over). The entry is in SimPlayer's units, which
 * differ from the stored position on a trimmed lesson (see resumeVirtualMs).
 */
function seedResumePosition(
  resumeKey: string,
  progress: ProgressValues | null,
  lesson: OfflineLesson,
  legacySelfResumeKey?: string
) {
  try {
    const key = `sim-resume:${resumeKey}`;
    if (window.localStorage.getItem(key)) return;
    // v2 keyed the offline resume position by account + lesson. Copy it only
    // into self's v3 key; child profiles must never inherit family progress.
    const legacy = legacySelfResumeKey ? window.localStorage.getItem(`sim-resume:${legacySelfResumeKey}`) : null;
    if (legacy !== null) {
      window.localStorage.setItem(key, legacy);
      return;
    }
    if (!progress || progress.completed) return;
    const virtualMs = resumeVirtualMs(lesson, progress.last_position_seconds);
    if (virtualMs === null) return;
    window.localStorage.setItem(key, String(virtualMs));
  } catch {
    // Storage blocked: the lesson starts from the beginning.
  }
}

/**
 * Keeps a crash inside the player on this page, in the family's language,
 * instead of reaching the app-wide error screen (which offline may not even
 * be able to load).
 */
class PlayerErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("OfflineLessonPlayer: playback crashed", error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Reads `?id=` (inside the page's Suspense boundary, so the page itself is prerendered). */
export function OfflinePlayerFromSearchParams() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id")?.trim() || null;
  const learnerId = searchParams.get("learnerId")?.trim() || null;
  // Keyed so a different lesson starts from a clean state.
  return <OfflineLessonPlayer key={`${id ?? ""}:${learnerId ?? ""}`} lessonId={id} learnerId={learnerId} />;
}

/** Static placeholder while the player's client code starts (also the page's prerendered HTML). */
export function OfflinePlayerSkeleton() {
  const { language } = useLanguage();
  return (
    <div className="min-h-svh bg-[#FCFCFC]" role="status" aria-busy="true">
      <span className="sr-only">{COPY[language].loading}</span>
      <div className="border-b border-gray-200 bg-white pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-3 sm:px-4">
          <div className="h-11 w-11 shrink-0 rounded-lg bg-gray-100" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 max-w-xs rounded bg-gray-100" />
            <div className="h-3 w-1/3 max-w-[10rem] rounded bg-gray-100" />
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-6xl sm:px-3 sm:py-3">
        <div className="aspect-video w-full animate-pulse bg-gray-100 sm:rounded-lg" />
        <div className="h-14 border-b border-gray-100 bg-white sm:rounded-b-lg" />
      </div>
    </div>
  );
}

function PlayerMessage({
  illustration,
  title,
  body,
  children,
}: {
  illustration: ReactNode;
  title: string;
  body: string;
  children: ReactNode;
}) {
  const { isRtl } = useLanguage();
  return (
    <main
      dir={isRtl ? "rtl" : "ltr"}
      className="flex min-h-svh items-center justify-center px-4 py-10"
      style={{ background: BRAND_BACKGROUND }}
    >
      <div className="w-full max-w-md rounded-[28px] bg-[#f5faf5]/90 p-6 text-center shadow-xl ring-1 ring-white">
        <div className="mx-auto h-24 w-24">{illustration}</div>
        <h1 className="mt-3 font-fredoka text-2xl font-bold text-gray-900">{title}</h1>
        <p className="mt-2 text-base text-gray-600">{body}</p>
        <div className="mt-6 flex flex-col gap-3">{children}</div>
      </div>
    </main>
  );
}

const primaryButton =
  "flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#007229] px-6 py-3 font-fredoka text-lg font-bold text-white shadow-[0_4px_0_#005C22] transition-transform active:translate-y-0.5 active:shadow-[0_2px_0_#005C22]";
const secondaryLink =
  "flex min-h-11 items-center justify-center rounded-2xl px-4 py-2 font-fredoka font-bold text-[#007229] hover:bg-white/70";

export default function OfflineLessonPlayer({ lessonId, learnerId: requestedLearnerId }: { lessonId: string | null; learnerId?: string | null }) {
  const { language, isRtl } = useLanguage();
  const t = COPY[language];
  const isOnline = useOnlineStatus();
  const [state, setState] = useState<PlayerState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [storageProblem, setStorageProblem] = useState(false);
  // The lesson was finished during this visit (phones only see the header's check icon).
  const [justFinished, setJustFinished] = useState(false);
  useScreenWakeLock(playing);

  // Set once another tab (or this one) logs out: nothing more may be written
  // for the previous account.
  const clearedRef = useRef(false);
  // Whether the lesson already counts as finished (when it opened, or since).
  const finishedRef = useRef(false);

  // ── Load the saved lesson ────────────────────────────────────────────────
  useEffect(() => {
    if (!lessonId) return;
    let disposed = false;
    let objectUrl: string | null = null;

    const load = async () => {
      try {
        const owner = await getOwner();
        const lesson = owner ? await getOwnedOfflineLesson(lessonId) : null;
        if (disposed || clearedRef.current) return;
        // No owner, someone else's copy, or nothing saved: not downloaded.
        if (!owner || !lesson?.sim?.sim) {
          setState({ status: "not_downloaded" });
          return;
        }

        const audio = await getCachedSimAudio(lessonId);
        if (disposed || clearedRef.current) return;
        if (!audio) {
          setState({ status: "incomplete" });
          return;
        }

        const cachedLearnerId = owner ? getCachedActiveLearnerId(owner.userId) : "";
        const learnerId = owner && requestedLearnerId && selectCachedLearner(owner.userId, requestedLearnerId)
          ? requestedLearnerId
          : cachedLearnerId;
        const nextNeighbor = lesson.neighbors?.next ?? null;
        const [savedResponses, progress, nextSaved] = await Promise.all([
          getSavedSlideResponses(owner.userId, lessonId, learnerId),
          getEffectiveLessonProgress(owner.userId, lessonId, learnerId).catch(() => null),
          nextNeighbor ? getOwnedOfflineLesson(nextNeighbor.id).catch(() => null) : Promise.resolve(null),
        ]);
        if (disposed || clearedRef.current) return;

        objectUrl = URL.createObjectURL(audio);
        seedResumePosition(
          `${owner.userId}:${learnerId}:${lessonId}`,
          progress,
          lesson,
          learnerId === owner.userId ? `${owner.userId}:${lessonId}` : undefined
        );
        finishedRef.current = progress?.completed === true;
        setState({
          status: "ready",
          ownerId: owner.userId,
          learnerId,
          lesson,
          // The stored sim has audio_url null; play the phone's copy.
          payload: { ...lesson.sim, audio_url: objectUrl },
          savedResponses,
          progress,
          // Offer the next lesson only when it's saved here too.
          next: nextSaved?.sim ? nextNeighbor : null,
        });
      } catch {
        if (!disposed && !clearedRef.current) setState({ status: "error" });
      }
    };

    void load();
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [lessonId, requestedLearnerId, reloadKey]);

  // Logout in any tab removes the downloads: stop showing this one.
  useEffect(
    () =>
      onPrivateDataCleared(() => {
        clearedRef.current = true;
        setPlaying(false);
        setState({ status: "not_downloaded" });
      }),
    []
  );

  // While online, make sure every activity chunk and the offline pages are
  // cached for next time.
  useEffect(() => {
    const warm = () => {
      void warmOfflinePlayerChunks();
    };
    const timer = window.setTimeout(() => {
      if (navigator.onLine) warm();
    }, WARM_DELAY_MS);
    window.addEventListener("online", warm);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", warm);
    };
  }, []);

  // ── Progress ─────────────────────────────────────────────────────────────
  const ready = state.status === "ready" ? state : null;
  const ownerId = ready?.ownerId ?? null;
  const learnerId = ready?.learnerId ?? null;
  const durationSec = ready ? lessonDurationSec(ready.lesson) : 0;

  // Furthest point reached this visit, and the last one saved.
  const latestRef = useRef<ProgressCheckpoint | null>(null);
  const lastSavedRef = useRef<ProgressCheckpoint | null>(null);
  // Saves run one after another, so they never race each other.
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());

  const saveProgress = useCallback(
    (checkpoint: ProgressCheckpoint) => {
      if (!ownerId || !lessonId || clearedRef.current) return;
      lastSavedRef.current = checkpoint;
      saveChainRef.current = saveChainRef.current
        .then(async () => {
          if (clearedRef.current) return;
          const saved = await queueLessonProgress({
            ownerId,
            learnerId: learnerId ?? ownerId,
            lessonId,
            positionSec: checkpoint.positionSec,
            watchSec: checkpoint.positionSec,
            completedCandidate: checkpoint.completedCandidate,
          });
          // Finished during this visit: show it now. Only on that change, so
          // the player isn't re-rendered on every save; payload and answers
          // keep their references, so SimPlayer carries on undisturbed.
          if (saved.completed && !finishedRef.current && !clearedRef.current) {
            finishedRef.current = true;
            setState((current) =>
              current.status === "ready" && !current.progress?.completed ? { ...current, progress: saved } : current
            );
            setJustFinished(true);
          }
        })
        .catch(() => {
          setStorageProblem(true);
        });
    },
    [lessonId, learnerId, ownerId]
  );

  const flushProgress = useCallback(() => {
    const latest = latestRef.current;
    if (latest && hasUnsavedProgress(lastSavedRef.current, latest)) saveProgress(latest);
  }, [saveProgress]);

  // SimPlayer reports progress many times a second; save every few seconds of
  // new playback, when the lesson counts as finished, and on pause or leave.
  const handleProgress = useCallback(
    (pct: number) => {
      const previous = latestRef.current;
      const next: ProgressCheckpoint = {
        positionSec: Math.max(positionForPercent(pct, durationSec), previous?.positionSec ?? 0),
        completedCandidate: Boolean(previous?.completedCandidate) || pct >= COMPLETION_PERCENT,
      };
      latestRef.current = next;
      if (shouldSaveProgress(lastSavedRef.current, next)) saveProgress(next);
    },
    [durationSec, saveProgress]
  );

  const handlePlayState = useCallback(
    (isPlaying: boolean) => {
      setPlaying(isPlaying);
      if (!isPlaying) flushProgress();
    },
    [flushProgress]
  );

  useEffect(() => {
    window.addEventListener("pagehide", flushProgress);
    return () => {
      window.removeEventListener("pagehide", flushProgress);
      flushProgress();
    };
  }, [flushProgress]);

  // ── Activity answers ─────────────────────────────────────────────────────
  const handleSlideResponse = useCallback(
    (slideId: string, answer: unknown, isCorrect: boolean | null) => {
      if (!ownerId || !lessonId || clearedRef.current) return;
      const onSaveFailed = () => setStorageProblem(true);
      if (answer === null || answer === undefined) {
        // A skipped activity: queue it (teachers see skips) without
        // replacing an answer this phone already shows for the slide.
        void queueSlideResponse({ ownerId, learnerId: learnerId ?? ownerId, lessonId, slideId, answer: null }).catch(onSaveFailed);
        return;
      }
      // Keep SimPlayer's restore-on-seek in step with what was just answered.
      setState((current) =>
        current.status === "ready"
          ? {
              ...current,
              savedResponses: { ...current.savedResponses, [slideId]: { answer, isCorrect: isCorrect === true } },
            }
          : current
      );
      void saveSlideResponseOffline({ ownerId, learnerId: learnerId ?? ownerId, lessonId, slideId, answer, isCorrect }).catch(onSaveFailed);
    },
    [learnerId, lessonId, ownerId]
  );

  // iOS can drop the blob: URL the narration plays from (when it restarts its
  // networking process) while the copy in Cache Storage is fine: SimPlayer
  // asks for a fresh URL from it. Never after logout or an account switch
  // (both clear storage and set clearedRef). No database read: the same
  // event can leave the open IndexedDB connection hanging.
  const reloadDeviceAudio = useCallback(async () => {
    if (!lessonId || clearedRef.current) return null;
    const audio = await getCachedSimAudio(lessonId);
    if (!audio || clearedRef.current) return null;
    return URL.createObjectURL(audio);
  }, [lessonId]);

  const retry = () => {
    setState({ status: "loading" });
    setReloadKey((key) => key + 1);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const fullLessonHref = lessonId ? `/lessons/${encodeURIComponent(lessonId)}` : null;

  if (!lessonId || state.status === "not_downloaded") {
    return (
      <PlayerMessage illustration={<OwlConfused className="h-full w-full" />} title={t.notSavedTitle} body={t.notSavedBody}>
        <a href={OFFLINE_HUB_PATH} className={primaryButton}>
          {t.back}
        </a>
        {isOnline && fullLessonHref && (
          <a href={fullLessonHref} className={secondaryLink}>
            {t.openFullLesson}
          </a>
        )}
      </PlayerMessage>
    );
  }

  if (state.status === "incomplete") {
    return (
      <PlayerMessage illustration={<OwlSad className="h-full w-full" />} title={t.incompleteTitle} body={t.incompleteBody}>
        <a href={OFFLINE_HUB_PATH} className={primaryButton}>
          {t.back}
        </a>
        {isOnline && fullLessonHref && (
          <a href={fullLessonHref} className={secondaryLink}>
            {t.openFullLesson}
          </a>
        )}
      </PlayerMessage>
    );
  }

  if (state.status === "error") {
    return (
      <PlayerMessage illustration={<OwlSad className="h-full w-full" />} title={t.errorTitle} body={t.errorBody}>
        <button type="button" onClick={retry} className={primaryButton}>
          {t.tryAgain}
        </button>
        <a href={OFFLINE_HUB_PATH} className={secondaryLink}>
          {t.back}
        </a>
      </PlayerMessage>
    );
  }

  if (state.status === "loading" || !ready) {
    return <OfflinePlayerSkeleton />;
  }

  const { lesson, payload, savedResponses, progress, next } = ready;
  const contentLanguage = contentLanguageFor(lesson, language);
  const title = pickLocalized(contentLanguage, lesson.title_ar, lesson.title_en);
  const subject = pickLocalized(contentLanguage, lesson.subject_name_ar, lesson.subject_name_en);
  const practice = lesson.practice;
  const BackIcon = isRtl ? ArrowRight : ArrowLeft;
  const NextIcon = isRtl ? ArrowLeft : ArrowRight;

  return (
    <div className="min-h-svh bg-[#FCFCFC]" dir={isRtl ? "rtl" : "ltr"}>
      <header className="border-b border-gray-200 bg-white pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4">
          <a
            href={OFFLINE_HUB_PATH}
            aria-label={t.back}
            title={t.back}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-gray-500 transition-colors hover:bg-[#007229]/5 hover:text-[#007229]"
          >
            <BackIcon className="h-5 w-5" aria-hidden="true" />
          </a>
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-base font-semibold leading-snug text-gray-900" dir="auto">
              {title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 text-sm text-gray-500">
              {subject && <span dir="auto">{subject}</span>}
              {subject && lesson.grade_level ? <span aria-hidden="true">•</span> : null}
              {lesson.grade_level ? (
                <span>
                  {t.grade} {lesson.grade_level}
                </span>
              ) : null}
              {/* Always shown, on phones too: on Wi-Fi without internet the
                  player's own offline notice stays hidden (navigator.onLine is true). */}
              <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                <Smartphone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {t.savedOnPhone}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {progress?.completed && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#007229]/10 px-3 py-1.5 text-sm font-medium text-[#007229]">
                <Check className="h-4 w-4" aria-hidden="true" />
                <span className="max-sm:sr-only">{t.finished}</span>
              </span>
            )}
            <LanguageToggle className="max-sm:px-2.5" />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl sm:px-3 sm:py-3">
        <PlayerErrorBoundary
          fallback={
            <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-10 text-center">
              <OwlSad className="h-20 w-20" />
              <p className="font-fredoka text-xl font-bold text-gray-900">{t.crashTitle}</p>
              <p className="text-sm text-gray-600">{t.crashBody}</p>
              {/* A fresh page load gets a clean player (and a fresh audio URL). */}
              <a href={offlinePlayerUrl(lesson.id, ready.learnerId)} className="inline-flex min-h-11 items-center rounded-2xl bg-[#007229] px-5 py-2 font-fredoka font-bold text-white shadow-[0_4px_0_#005C22]">
                {t.openAgain}
              </a>
            </div>
          }
        >
          <SimPlayer
            className="max-sm:rounded-none max-sm:border-x-0"
            payload={payload}
            language={contentLanguage}
            savedResponses={savedResponses}
            onProgress={handleProgress}
            onPlayStateChange={handlePlayState}
            onSlideResponse={handleSlideResponse}
            playingFromDevice
            reloadDeviceAudio={reloadDeviceAudio}
            reopenHref={offlinePlayerUrl(lesson.id, ready.learnerId)}
            resumeKey={`${ready.ownerId}:${ready.learnerId}:${lesson.id}`}
            mediaTitle={title}
          />
        </PlayerErrorBoundary>
      </div>

      <div className="mx-auto max-w-6xl space-y-3 px-4 py-4 sm:px-3">
        {justFinished && (
          <p role="status" className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {t.finishedNote}
          </p>
        )}

        {/* Saved before schema 2: no pictures, and the phone can't show it as finished. */}
        {lesson.schema !== 2 && (
          <p role="note" className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {t.oldCopyNote}
          </p>
        )}

        {lesson.audioMayNotPlay && (
          <p role="note" className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {AUDIO_FORMAT_WARNING[language]}
          </p>
        )}

        {storageProblem && (
          <p role="alert" className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {t.storageProblem}
          </p>
        )}

        {/* Practice stays online-only; no dead link offline. */}
        {practice && !practice.passed && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <CloudOff className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-fredoka text-lg font-semibold">{t.practiceTitle}</p>
              <p className="text-sm">{t.practiceBody}</p>
              {isOnline && (
                <a
                  href={`/practice/${encodeURIComponent(practice.assignmentId)}?from=lesson`}
                  className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-[#007229] px-4 py-2 text-sm font-bold text-white hover:bg-[#005C22]"
                >
                  {t.startPractice}
                </a>
              )}
            </div>
          </div>
        )}

        {next && (
          <a
            href={offlinePlayerUrl(next.id, ready.learnerId)}
            className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 transition-shadow hover:ring-emerald-300"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#007229] text-white shadow-[0_3px_0_#005C22]">
              <NextIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold text-emerald-700">{t.nextLesson}</span>
              <span className="block truncate font-fredoka text-lg font-semibold text-gray-900" dir="auto">
                {pickLocalized(contentLanguage, next.title_ar, next.title_en)}
              </span>
            </span>
          </a>
        )}

        {isOnline && fullLessonHref && (
          <p className="pt-1 text-center">
            <a href={fullLessonHref} className="inline-flex min-h-11 items-center text-sm font-bold text-[#007229] underline-offset-4 hover:underline">
              {t.openFullLesson}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
