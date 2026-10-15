"use client";

/**
 * The downloads hub (/offline): the lessons saved on this phone, usable with
 * no connection. The service worker serves this page whenever a navigation
 * fails (airplane mode, a cold start offline, Wi-Fi without internet), so it
 * always lists the saved lessons, whatever navigator.onLine says.
 *
 * Everything is read through src/lib/offline — never by opening IndexedDB
 * here (an open without its upgrade step once created store-less databases
 * that broke downloads). The owner record says whose lessons these are;
 * another account's copies are treated as not downloaded. Nothing here calls
 * supabase. Links are plain <a> (full page loads): a client-side navigation
 * would fetch an RSC payload that fails offline.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { CloudUpload, LogOut, Play, RefreshCw, Smartphone, Trash2, TriangleAlert } from "lucide-react";
import { MadrassaLogo, OwlReading, OwlSad } from "@/components/illustrations";
import { useLanguage } from "@/contexts/LanguageContext";
import { logOut } from "@/lib/auth/logout";
import { offlinePlayerUrl } from "@/lib/offline/cache-names";
import { getAllOfflineLessons, hasCachedSimAudio, onPrivateDataCleared, type OfflineLesson } from "@/lib/offline/db";
import { deleteDownloadedLesson, getStorageEstimate } from "@/lib/offline/download-manager";
import { getOwner, ownsRecord, type OfflineOwner } from "@/lib/offline/identity";
import { countUnsyncedItems, getEffectiveLessonProgress, type ProgressValues } from "@/lib/offline/sync";
import { warmOfflinePlayerChunks } from "@/lib/offline/warm";
import { currentInstallPlatform, subscribeToInstallPlatform } from "@/lib/pwa-install";
import { LanguageToggle } from "./LanguageToggle";
import { OFFLINE_SYNCED_EVENT } from "./OfflineSyncRunner";
import { useOnlineStatus } from "./useOnlineStatus";
import {
  contentLanguageFor,
  formatBytes,
  formatSavedDate,
  lessonDurationSec,
  pickLocalized,
  savedLessonBytes,
  watchedPercent,
} from "./helpers";

const COPY = {
  en: {
    title: "Your saved lessons",
    savedFor: (name: string) => `Saved for ${name}`,
    lessonCount: (count: number) => (count === 1 ? "1 lesson" : `${count} lessons`),
    used: (size: string) => `${size} used`,
    free: (size: string) => `${size} free on this phone`,
    waitingToSend: (count: number) => `Progress waiting to be sent (${count})`,
    online: "Online",
    offline: "No internet",
    ready: "Ready",
    needsRedownload: "Needs re-download",
    needsRedownloadHint: "Connect to the internet and save it again.",
    updateAvailable: "Update available",
    updateAvailableHint: "A newer version is ready. Save it again while online.",
    saved: (date: string) => `Saved ${date}`,
    finished: "Finished",
    play: (title: string) => `Play ${title}`,
    remove: "Remove",
    removing: "Removing…",
    confirmRemove: "Remove this lesson from this phone?",
    removeFailed: "Couldn't remove the lesson. Try again.",
    emptyTitle: "No saved lessons yet",
    emptyBody: "Save lessons while online to watch them here without internet.",
    iosNote: "On iPhone, save lessons inside the installed Amal app — Safari can clear them.",
    hiddenNote: "Some lessons saved earlier will show here after you open Amal once while online.",
    loadFailed: "Saved lessons couldn't be opened on this phone.",
    tryLoadAgain: "Try again",
    tryInternet: "Try the internet again",
    logOut: "Switch account / log out",
    loggingOut: "Logging out…",
    confirmLogOut: "Log out? The lessons saved on this phone will be removed.",
    confirmLogOutUnsynced: (count: number) =>
      `Some progress and answers haven't been sent yet (${count}). Logging out without internet loses them and removes the lessons saved on this phone. Log out anyway?`,
  },
  ar: {
    title: "دروسك المحفوظة",
    savedFor: (name: string) => `محفوظة لـ ${name}`,
    lessonCount: (count: number) =>
      count === 1 ? "درس واحد" : count === 2 ? "درسان" : count >= 3 && count <= 10 ? `${count} دروس` : `${count} درسًا`,
    // Sizes ("188 KB") are isolated left-to-right, or the bidi algorithm shows "KB 188".
    used: (size: string) => `\u2066${size}\u2069 مستخدمة`,
    free: (size: string) => `\u2066${size}\u2069 متاحة على هذا الهاتف`,
    waitingToSend: (count: number) => `تقدّم بانتظار الإرسال (${count})`,
    online: "متصل",
    offline: "بدون إنترنت",
    ready: "جاهز",
    needsRedownload: "يحتاج إلى إعادة التنزيل",
    needsRedownloadHint: "اتصل بالإنترنت واحفظه مرة أخرى.",
    updateAvailable: "يتوفر تحديث",
    updateAvailableHint: "نسخة أحدث جاهزة. احفظه مرة أخرى وأنت متصل بالإنترنت.",
    saved: (date: string) => `حُفظ في ${date}`,
    finished: "مكتمل",
    play: (title: string) => `شغّل ${title}`,
    remove: "حذف",
    removing: "جارٍ الحذف…",
    confirmRemove: "حذف هذا الدرس من هذا الهاتف؟",
    removeFailed: "تعذّر حذف الدرس. حاول مرة أخرى.",
    emptyTitle: "لا توجد دروس محفوظة بعد",
    emptyBody: "احفظ الدروس وأنت متصل بالإنترنت لتشاهدها هنا بدون إنترنت.",
    iosNote: "على iPhone، احفظ الدروس داخل تطبيق آمال المثبّت، فقد يحذفها Safari.",
    hiddenNote: "ستظهر هنا بعض الدروس المحفوظة سابقًا بعد أن تفتح آمال مرة واحدة وأنت متصل بالإنترنت.",
    loadFailed: "تعذّر فتح الدروس المحفوظة على هذا الهاتف.",
    tryLoadAgain: "حاول مرة أخرى",
    tryInternet: "جرّب الإنترنت مرة أخرى",
    logOut: "تبديل الحساب / تسجيل الخروج",
    loggingOut: "جارٍ تسجيل الخروج…",
    confirmLogOut: "تسجيل الخروج؟ ستُحذف الدروس المحفوظة على هذا الهاتف.",
    confirmLogOutUnsynced: (count: number) =>
      `لم يُرسل بعد بعض التقدّم والإجابات (${count}). تسجيل الخروج بدون إنترنت سيحذفها، وسيحذف الدروس المحفوظة على هذا الهاتف. هل تريد تسجيل الخروج؟`,
  },
} as const;

const BRAND_BACKGROUND = "linear-gradient(180deg, #e4efff 0%, #eef0fb 30%, #eef6ee 65%, #dcefdd 100%)";
// Warming fetches the offline pages and activity chunks; let this page settle first.
const WARM_DELAY_MS = 5_000;

interface HubLesson {
  lesson: OfflineLesson;
  audioReady: boolean;
  progress: ProgressValues | null;
}

type HubState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; owner: OfflineOwner | null; lessons: HubLesson[]; hiddenCount: number };

const EMPTY_READY: HubState = { status: "ready", owner: null, lessons: [], hiddenCount: 0 };

async function readSavedLessons(): Promise<HubState> {
  const [owner, all] = await Promise.all([getOwner(), getAllOfflineLessons()]);
  const owned = all
    .filter((lesson) => ownsRecord(lesson, owner))
    .sort((left, right) => Date.parse(right.downloadedAt) - Date.parse(left.downloadedAt));
  const lessons = await Promise.all(
    owned.map(async (lesson) => ({
      lesson,
      audioReady: await hasCachedSimAudio(lesson.id),
      progress: owner ? await getEffectiveLessonProgress(owner.userId, lesson.id).catch(() => null) : null,
    }))
  );
  return { status: "ready", owner, lessons, hiddenCount: all.length - owned.length };
}

const IOS_TAB_PLATFORMS = new Set(["ios-safari", "ios-browser", "ios-in-app"]);
const noPlatform = () => null;

/** True in an iPhone/iPad browser tab, where storage can be cleared and isn't shared with the installed app. */
function useIsIosBrowserTab(): boolean {
  const platform = useSyncExternalStore(subscribeToInstallPlatform, currentInstallPlatform, noPlatform);
  return platform !== null && IOS_TAB_PLATFORMS.has(platform);
}

export default function OfflineHub() {
  const { language, isRtl } = useLanguage();
  const t = COPY[language];
  const isOnline = useOnlineStatus();
  const iosBrowserTab = useIsIosBrowserTab();
  const [state, setState] = useState<HubState>({ status: "loading" });
  const [storage, setStorage] = useState<{ used: number; quota: number } | null>(null);
  const [unsynced, setUnsynced] = useState(0);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  // Bumped when storage is cleared, so a read that started before can't
  // put the previous account's lessons back on screen.
  const clearGenerationRef = useRef(0);

  const refresh = useCallback(async () => {
    const generation = clearGenerationRef.current;
    try {
      const next = await readSavedLessons();
      if (generation !== clearGenerationRef.current) return;
      setState(next);
      const ownerId = next.status === "ready" ? next.owner?.userId : undefined;
      const [estimate, waiting] = await Promise.all([getStorageEstimate(), countUnsyncedItems(ownerId)]);
      if (generation !== clearGenerationRef.current) return;
      setStorage(estimate);
      setUnsynced(waiting);
    } catch {
      if (generation === clearGenerationRef.current) setState({ status: "error" });
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Coming back here with the browser's back button can restore a stale copy of the page.
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void refresh();
    };
    const handleSynced = () => void refresh();
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener(OFFLINE_SYNCED_EVENT, handleSynced);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener(OFFLINE_SYNCED_EVENT, handleSynced);
    };
  }, [refresh]);

  // Logout (in this tab or another) wipes the downloads. Don't re-read here:
  // opening the database mid-deletion would recreate it.
  useEffect(
    () =>
      onPrivateDataCleared(() => {
        clearGenerationRef.current += 1;
        setState(EMPTY_READY);
        setUnsynced(0);
      }),
    []
  );

  // While online, keep the offline pages and activity chunks cached.
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

  const handleRemove = async (lessonId: string) => {
    if (!window.confirm(t.confirmRemove)) return;
    setRemovingId(lessonId);
    try {
      await deleteDownloadedLesson(lessonId);
    } catch {
      toast.error(t.removeFailed);
    } finally {
      setRemovingId(null);
      await refresh();
    }
  };

  const handleLogOut = async () => {
    const owner = state.status === "ready" ? state.owner : null;
    const waiting = await countUnsyncedItems(owner?.userId);
    const message = waiting > 0 && !navigator.onLine ? t.confirmLogOutUnsynced(waiting) : t.confirmLogOut;
    if (!window.confirm(message)) return;
    setLoggingOut(true);
    // Syncs first when online, ends the session even offline, wipes this
    // phone's downloads and reloads the home page.
    await logOut();
  };

  const owner = state.status === "ready" ? state.owner : null;
  const lessons = state.status === "ready" ? state.lessons : [];
  const savedBytes = lessons.reduce((total, item) => total + savedLessonBytes(item.lesson), 0);
  const freeBytes = storage && storage.quota > 0 ? Math.max(0, storage.quota - storage.used) : 0;

  return (
    <main dir={isRtl ? "rtl" : "ltr"} className="min-h-svh" style={{ background: BRAND_BACKGROUND }}>
      <div className="mx-auto max-w-3xl px-4 pb-12 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between gap-3">
          <MadrassaLogo size="sm" />
          <LanguageToggle />
        </header>

        <section className="mt-6 flex items-center gap-4">
          <OwlReading className="h-20 w-20 shrink-0 drop-shadow-lg" />
          <div className="min-w-0">
            <h1 className="font-fredoka text-3xl font-bold leading-tight text-gray-900">{t.title}</h1>
            {owner?.fullName ? (
              <p className="mt-1 truncate text-base text-gray-600" dir="auto">
                {t.savedFor(owner.fullName)}
              </p>
            ) : null}
          </div>
        </section>

        <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ${
              isOnline ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${isOnline ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden="true" />
            {isOnline ? t.online : t.offline}
          </span>
          {lessons.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-gray-700">
              <Smartphone className="h-4 w-4 text-[#007229]" aria-hidden="true" />
              {t.lessonCount(lessons.length)} · {t.used(formatBytes(savedBytes))}
            </span>
          )}
          {lessons.length > 0 && freeBytes > 0 && (
            <span className="rounded-full bg-white/60 px-3 py-1 text-gray-600">{t.free(formatBytes(freeBytes))}</span>
          )}
          {unsynced > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-amber-800">
              <CloudUpload className="h-4 w-4" aria-hidden="true" />
              {t.waitingToSend(unsynced)}
            </span>
          )}
        </div>

        <div className="mt-6">
          {state.status === "loading" ? (
            <ul className="space-y-3" aria-busy="true">
              {[0, 1, 2].map((item) => (
                <li key={item} className="h-28 animate-pulse rounded-3xl bg-white/70" />
              ))}
            </ul>
          ) : state.status === "error" ? (
            <div role="alert" className="rounded-[28px] bg-[#f5faf5]/90 p-6 text-center shadow-xl ring-1 ring-white">
              <OwlSad className="mx-auto h-20 w-20" />
              <p className="mt-3 text-base font-semibold text-gray-800">{t.loadFailed}</p>
              <button
                type="button"
                onClick={() => {
                  setState({ status: "loading" });
                  void refresh();
                }}
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#007229] px-5 py-2 font-fredoka font-bold text-white shadow-[0_4px_0_#005C22]"
              >
                {t.tryLoadAgain}
              </button>
            </div>
          ) : lessons.length === 0 ? (
            <div className="rounded-[28px] bg-[#f5faf5]/90 p-6 text-center shadow-xl ring-1 ring-white">
              <h2 className="font-fredoka text-2xl font-bold text-gray-900">{t.emptyTitle}</h2>
              <p className="mx-auto mt-2 max-w-sm text-base text-gray-600">{t.emptyBody}</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {lessons.map((item) => (
                <SavedLessonCard
                  key={item.lesson.id}
                  item={item}
                  removing={removingId === item.lesson.id}
                  disabled={loggingOut}
                  onRemove={() => void handleRemove(item.lesson.id)}
                />
              ))}
            </ul>
          )}
        </div>

        {state.status === "ready" && state.hiddenCount > 0 && (
          <p className="mt-4 rounded-2xl bg-white/70 px-4 py-3 text-sm text-gray-600">{t.hiddenNote}</p>
        )}

        {iosBrowserTab && (
          <p className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {t.iosNote}
          </p>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {/* A full page load: offline, the service worker brings it back here. */}
          <a
            href="/dashboard"
            aria-disabled={loggingOut || undefined}
            className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#007229] px-6 py-3 font-fredoka text-lg font-bold text-white shadow-[0_4px_0_#005C22] transition-transform active:translate-y-0.5 active:shadow-[0_2px_0_#005C22] ${
              loggingOut ? "pointer-events-none opacity-60" : ""
            }`}
          >
            <RefreshCw className="h-5 w-5" aria-hidden="true" />
            {t.tryInternet}
          </a>
          <button
            type="button"
            disabled={loggingOut}
            onClick={() => void handleLogOut()}
            className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-6 py-3 font-fredoka text-base font-bold text-gray-700 transition-colors hover:border-red-200 hover:text-red-700 disabled:opacity-60"
          >
            <LogOut className={`h-5 w-5 ${isRtl ? "rotate-180" : ""}`} aria-hidden="true" />
            {loggingOut ? t.loggingOut : t.logOut}
          </button>
        </div>
      </div>
    </main>
  );
}

function SavedLessonCard({
  item,
  removing,
  disabled,
  onRemove,
}: {
  item: HubLesson;
  removing: boolean;
  disabled: boolean;
  onRemove: () => void;
}) {
  const { language } = useLanguage();
  const t = COPY[language];
  const { lesson, audioReady, progress } = item;
  const contentLanguage = contentLanguageFor(lesson, language);
  const title = pickLocalized(contentLanguage, lesson.title_ar, lesson.title_en);
  const subject = pickLocalized(contentLanguage, lesson.subject_name_ar, lesson.subject_name_en);
  const percent = watchedPercent(progress?.last_position_seconds ?? 0, lessonDurationSec(lesson), progress?.completed);
  const savedDate = formatSavedDate(lesson.downloadedAt, language);

  const badge = !audioReady
    ? { label: t.needsRedownload, hint: t.needsRedownloadHint, className: "bg-amber-100 text-amber-800" }
    : lesson.updateAvailable
      ? { label: t.updateAvailable, hint: t.updateAvailableHint, className: "bg-blue-50 text-blue-700" }
      : { label: progress?.completed ? t.finished : t.ready, hint: null, className: "bg-emerald-100 text-emerald-800" };

  return (
    <li className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
      <a
        href={offlinePlayerUrl(lesson.id)}
        aria-label={t.play(title)}
        className="flex items-center gap-4 p-4 transition-colors hover:bg-emerald-50/50 active:bg-emerald-50"
      >
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#007229] text-white shadow-[0_3px_0_#005C22]">
          <Play className="h-6 w-6 fill-current" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block font-fredoka text-lg font-semibold leading-snug text-gray-900" dir="auto">
            {title}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
            {subject && <span dir="auto">{subject}</span>}
            <span dir="ltr">{formatBytes(savedLessonBytes(lesson))}</span>
            {savedDate && <span>{t.saved(savedDate)}</span>}
          </span>
          {percent > 0 && (
            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
              <span className="block h-full rounded-full bg-[#007229]" style={{ width: `${percent}%` }} />
            </span>
          )}
        </span>
      </a>
      <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-4 py-2">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${badge.className}`}>{badge.label}</span>
          {badge.hint && <span className="text-xs text-gray-500">{badge.hint}</span>}
        </span>
        <button
          type="button"
          disabled={removing || disabled}
          onClick={onRemove}
          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {removing ? t.removing : t.remove}
        </button>
      </div>
    </li>
  );
}
