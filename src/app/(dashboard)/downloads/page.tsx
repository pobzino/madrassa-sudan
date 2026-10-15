"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOffline, type DownloadResult } from "@/contexts/OfflineContext";
import { getCachedSimAudio, hasCachedSimAudio, type DownloadState, type OfflineLesson } from "@/lib/offline/db";
import { getOwnedOfflineLessons } from "@/lib/offline/identity";
import { offlinePlayerUrl } from "@/lib/offline/cache-names";
import {
  AUDIO_FORMAT_WARNING,
  KEEP_OPEN_WHILE_SAVING,
  MISSING_IMAGES_WARNING,
  downloadErrorMessage,
  getPersistenceStatus,
  requestPersistentStorage,
} from "@/lib/offline/download-manager";
import LessonComputerDownloadButton from "@/components/lessons/LessonComputerDownloadButton";
import { useInstallPlatform } from "@/components/pwa/AddToPhone";
import { canDetectWifi, isAutoDownloadEnabled, setAutoDownloadEnabled } from "@/lib/offline/auto-download";
import { IOS_STORAGE_COPY, iosStorageContext, iosTabNote } from "@/lib/offline/support";
import { isIosDevice } from "@/lib/pwa-install";

const translations = {
  ar: {
    title: "التحميلات",
    subtitle: "الدروس المحفوظة على هذا الهاتف تعمل بدون إنترنت.",
    online: "متصل",
    offline: "بدون إنترنت",
    storage: "المساحة المستخدمة",
    unavailable: "غير متاح",
    savedLessons: "الدروس المحفوظة",
    savingNow: "قيد الحفظ",
    needsAttention: "يحتاج إلى انتباه",
    noDownloads: "لا توجد دروس محفوظة بعد",
    noDownloadsHint: "احفظ الدروس وأنت متصل بالإنترنت لتشاهدها هنا بدون إنترنت.",
    browseLessons: "تصفح الدروس",
    play: "شاهد",
    remove: "حذف",
    retry: "حاول مرة أخرى",
    cancel: "إلغاء",
    saving: "جارٍ الحفظ",
    ready: "جاهز",
    almostReady: "شبه جاهز",
    almostReadyHint: "أبقِ آمال مفتوحًا وأنت متصل بالإنترنت لإكمال حفظه.",
    needsRedownload: "يحتاج إلى إعادة التنزيل",
    saveAgain: "احفظ مرة أخرى",
    updateAvailable: "يتوفر تحديث",
    update: "حدّث",
    grade: "الصف",
    savedOn: "حُفظ في",
    size: "الحجم",
    confirmRemove: "حذف هذا الدرس من هذا الهاتف؟",
    unknownLesson: "درس",
    needsInternet: "اتصل بالإنترنت أولاً",
    persisted: "الدروس المحفوظة محمية على هذا الهاتف.",
    bestEffort: "قد يحذف هذا الهاتف الدروس المحفوظة إذا امتلأت مساحته.",
    keepSafe: "احمِ دروسي",
    notGranted: "لم يسمح المتصفح بذلك. تثبيت آمال على هاتفك يساعد.",
    autoDownload: "تحميل الدرس التالي عبر الواي فاي",
    autoDownloadHint: "أثناء التعلّم على الواي فاي، يُحفظ الدرس التالي على هذا الهاتف ليعمل لاحقاً بدون إنترنت. إذا كان الواي فاي من هاتف آخر (نقطة اتصال)، فقد يستهلك ذلك بياناته.",
  },
  en: {
    title: "Downloads",
    subtitle: "Lessons saved on this phone play without internet.",
    online: "Online",
    offline: "Offline",
    storage: "Storage used",
    unavailable: "Unavailable",
    savedLessons: "Saved lessons",
    savingNow: "Saving now",
    needsAttention: "Needs attention",
    noDownloads: "No saved lessons yet",
    noDownloadsHint: "Save lessons while online to watch them here without internet.",
    browseLessons: "Browse lessons",
    play: "Play",
    remove: "Remove",
    retry: "Try again",
    cancel: "Cancel",
    saving: "Saving",
    ready: "Ready",
    almostReady: "Almost ready",
    almostReadyHint: "Keep Amal open on the internet to finish saving it.",
    needsRedownload: "Needs re-download",
    saveAgain: "Save again",
    updateAvailable: "Update available",
    update: "Update",
    grade: "Grade",
    savedOn: "Saved",
    size: "Size",
    confirmRemove: "Remove this lesson from this phone?",
    unknownLesson: "Lesson",
    needsInternet: "Connect to the internet first",
    persisted: "Saved lessons are protected on this phone.",
    bestEffort: "This phone may clear saved lessons if it runs low on space.",
    keepSafe: "Keep my lessons safe",
    notGranted: "The browser didn't allow it. Installing Amal on your phone helps.",
    autoDownload: "Download the next lesson on Wi-Fi",
    autoDownloadHint: "While you learn on Wi-Fi, the next lesson saves to this phone so it plays later without internet. If the Wi-Fi is another phone's hotspot, this uses that phone's data.",
  },
};

type Copy = (typeof translations)["en"];
type Persistence = "persisted" | "best-effort" | "unsupported";

const noSubscription = () => () => {};

/** The Wi-Fi auto-download switch. Mounted only in the browser, after hydration. */
function AutoDownloadSetting({ label, hint }: { label: string; hint: string }) {
  const [enabled, setEnabled] = useState(() => isAutoDownloadEnabled());
  return (
    <label className="mb-6 flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <span>
        <span className="block text-sm font-bold text-gray-800">{label}</span>
        <span className="mt-0.5 block text-xs text-gray-500">{hint}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={enabled}
        onChange={(event) => {
          setAutoDownloadEnabled(event.target.checked);
          setEnabled(event.target.checked);
        }}
        className="h-6 w-6 shrink-0 cursor-pointer accent-[#007229]"
      />
    </label>
  );
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 MB";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

function formatDate(value: string, language: "ar" | "en") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language === "ar" ? "ar" : "en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function pick(language: "ar" | "en", arabic: string | null | undefined, english: string | null | undefined) {
  return (language === "ar" ? arabic || english : english || arabic) || "";
}

/** Saved lessons, newest first, and which of them lost their audio (evicted or half-cleared). */
async function readSavedLessons() {
  const saved = await getOwnedOfflineLessons();
  saved.sort((a, b) => Date.parse(b.downloadedAt) - Date.parse(a.downloadedAt));
  const audioChecks = await Promise.all(
    saved.map(async (lesson) => [lesson.id, await hasCachedSimAudio(lesson.id).catch(() => true)] as const)
  );
  return {
    lessons: saved,
    missingAudio: new Set(audioChecks.filter(([, present]) => !present).map(([id]) => id)),
  };
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#007229]/10">
      <div className="h-full rounded-full bg-[#007229] transition-[width] duration-300" style={{ width: `${percent}%` }} />
    </div>
  );
}

/** A download in progress, or one that failed, for a lesson that isn't saved (yet). */
function DownloadRow({
  state,
  t,
  language,
  isOnline,
  onRetry,
  onDismiss,
}: {
  state: DownloadState;
  t: Copy;
  language: "ar" | "en";
  isOnline: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const downloading = state.status === "downloading";
  const percent = Math.round(state.progress);
  const title = pick(language, state.title_ar, state.title_en) || t.unknownLesson;
  return (
    <div className="rounded-xl border border-gray-100 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-800">{title}</p>
          <p className={`text-xs ${downloading ? "text-gray-500" : "text-red-600"}`}>
            {downloading ? `${t.saving} ${percent}%` : downloadErrorMessage(state.errorCode, language)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!downloading && (
            <button
              type="button"
              disabled={!isOnline}
              title={isOnline ? undefined : t.needsInternet}
              onClick={onRetry}
              className="min-h-9 rounded-lg bg-[#007229] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#005C22] disabled:opacity-50"
            >
              {t.retry}
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="min-h-9 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-200"
          >
            {downloading ? t.cancel : t.remove}
          </button>
        </div>
      </div>
      {downloading && <ProgressBar percent={percent} />}
      {downloading && <p className="mt-2 text-xs text-gray-500">{KEEP_OPEN_WHILE_SAVING[language]}</p>}
    </div>
  );
}

export default function DownloadsPage() {
  const { language } = useLanguage();
  const t = translations[language];
  const isRtl = language === "ar";
  const {
    isOnline,
    downloads,
    downloadedLessonIds,
    updateAvailableIds,
    offlineReady,
    storageUsed,
    storageQuota,
    downloadLesson,
    cancelDownload,
    deleteLesson,
    checkForUpdates,
  } = useOffline();
  const [lessons, setLessons] = useState<OfflineLesson[]>([]);
  const [missingAudio, setMissingAudio] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [persistence, setPersistence] = useState<Persistence | null>(null);
  // Only Android browsers can tell Wi-Fi from mobile data, so only they get the switch.
  const wifiAware = useSyncExternalStore(noSubscription, canDetectWifi, () => false);
  const platform = useInstallPlatform();
  // iPhone storage in a browser tab (Safari, another browser, another app's
  // browser) is separate from the installed app's and can be cleared.
  const iosContext = iosStorageContext(platform, platform !== null && isIosDevice());
  const iosNote = iosTabNote(iosContext, language);

  const applySaved = useCallback((result: Awaited<ReturnType<typeof readSavedLessons>> | null) => {
    setLessons(result?.lessons ?? []);
    setMissingAudio(result?.missingAudio ?? new Set());
    setLoading(false);
  }, []);

  const loadLessons = useCallback(
    () => readSavedLessons().catch(() => null).then(applySaved),
    [applySaved]
  );

  // Re-read whenever the context's view of the phone changes (a save, an
  // update check, a removal, logout in another tab).
  useEffect(() => {
    let cancelled = false;
    void readSavedLessons()
      .catch(() => null)
      .then((result) => {
        if (!cancelled) applySaved(result);
      });
    return () => {
      cancelled = true;
    };
  }, [downloadedLessonIds, updateAvailableIds, applySaved]);

  useEffect(() => {
    void getPersistenceStatus().then(setPersistence);
    // Online, flag lessons the teacher re-recorded since they were saved.
    if (navigator.onLine) void checkForUpdates();
  }, [checkForUpdates]);

  const savedIds = useMemo(() => new Set(lessons.map((lesson) => lesson.id)), [lessons]);
  // Downloads of lessons not saved yet: in progress, or failed with a reason.
  const pendingRows = useMemo(
    () =>
      Array.from(downloads.values()).filter(
        (state) => state.status !== "completed" && state.status !== "idle" && !savedIds.has(state.lessonId)
      ),
    [downloads, savedIds]
  );
  const activeRows = pendingRows.filter((state) => state.status === "downloading");
  const failedRows = pendingRows.filter((state) => state.status === "error");

  const usedPercent = storageQuota > 0 ? Math.min(100, Math.round((storageUsed / storageQuota) * 100)) : 0;
  const savedBytes = lessons.reduce((total, lesson) => total + (lesson.audioSize || 0) + (lesson.assetBytes || 0), 0);

  const reportResult = (result: DownloadResult) => {
    if (result.status === "failed") toast.error(downloadErrorMessage(result.code, language));
    else if (result.status === "saved" && result.lesson.audioMayNotPlay) toast.warning(AUDIO_FORMAT_WARNING[language]);
    if (result.status === "saved" && result.lesson.missingAssetUrls?.length) {
      toast.warning(MISSING_IMAGES_WARNING[language]);
    }
  };

  const handleSave = async (lessonId: string) => {
    reportResult(await downloadLesson(lessonId));
    await loadLessons();
  };

  const handleRemove = async (lessonId: string) => {
    if (!window.confirm(t.confirmRemove)) return;
    setRemovingId(lessonId);
    try {
      await deleteLesson(lessonId);
      await loadLessons();
    } finally {
      setRemovingId(null);
    }
  };

  const handleKeepSafe = async () => {
    const granted = await requestPersistentStorage({ force: true });
    setPersistence(granted ? "persisted" : "best-effort");
    if (!granted) toast(t.notGranted);
  };

  return (
    <div className={`max-w-6xl mx-auto px-4 sm:px-6 py-6 ${isRtl ? "text-right" : ""}`} dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-fredoka text-gray-900">{t.title}</h1>
          <p className="text-sm text-gray-500 mt-1">{t.subtitle}</p>
        </div>
        <div
          className={`inline-flex items-center gap-2 self-start sm:self-auto px-3 py-1.5 rounded-full text-sm font-semibold ${
            isOnline ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${isOnline ? "bg-emerald-500" : "bg-amber-500"}`} />
          {isOnline ? t.online : t.offline}
        </div>
      </div>

      {iosNote && (
        <p className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">{iosNote}</p>
      )}

      {wifiAware && <AutoDownloadSetting label={t.autoDownload} hint={t.autoDownloadHint} />}

      <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr] mb-6">
        <section className={`bg-white border border-gray-100 rounded-2xl p-4 shadow-sm ${pendingRows.length === 0 ? "md:col-span-2" : ""}`}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-bold text-gray-800">{t.storage}</h2>
            <span className="text-xs font-semibold text-gray-500">
              {formatBytes(storageUsed)} / {storageQuota ? formatBytes(storageQuota) : t.unavailable}
            </span>
          </div>
          <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full rounded-full bg-[#007229]" style={{ width: `${usedPercent}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
            <span className="px-2 py-1 rounded-lg bg-gray-50">
              {lessons.length} {t.savedLessons}
            </span>
            <span className="px-2 py-1 rounded-lg bg-gray-50">
              {t.size}: {formatBytes(savedBytes)}
            </span>
          </div>
          {persistence === "persisted" && (
            <p className="mt-3 flex items-center gap-2 text-xs font-medium text-emerald-700">
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              {t.persisted}
            </p>
          )}
          {persistence === "best-effort" && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-gray-500">{t.bestEffort}</p>
              <button
                type="button"
                onClick={() => void handleKeepSafe()}
                className="min-h-9 rounded-lg bg-[#007229]/10 px-3 py-1.5 text-xs font-bold text-[#007229] hover:bg-[#007229]/15"
              >
                {t.keepSafe}
              </button>
            </div>
          )}
        </section>

        {pendingRows.length > 0 && (
          <section className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-5">
            {[
              { heading: t.savingNow, rows: activeRows },
              { heading: t.needsAttention, rows: failedRows },
            ]
              .filter((group) => group.rows.length > 0)
              .map((group) => (
                <div key={group.heading}>
                  <h2 className="text-sm font-bold text-gray-800 mb-3">{group.heading}</h2>
                  <div className="space-y-3">
                    {group.rows.map((state) => (
                      <DownloadRow
                        key={state.lessonId}
                        state={state}
                        t={t}
                        language={language}
                        isOnline={isOnline}
                        onRetry={() => void handleSave(state.lessonId)}
                        onDismiss={() => cancelDownload(state.lessonId)}
                      />
                    ))}
                  </div>
                </div>
              ))}
          </section>
        )}
      </div>

      <section>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-lg font-bold font-fredoka text-gray-900">{t.savedLessons}</h2>
          <Link
            href="/lessons"
            className="inline-flex items-center justify-center px-3 py-2 rounded-xl bg-[#007229] text-white text-sm font-bold hover:bg-[#005C22] transition-colors"
          >
            {t.browseLessons}
          </Link>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-40 rounded-2xl bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : lessons.length === 0 ? (
          <div className="min-h-[320px] rounded-2xl border border-dashed border-gray-200 bg-white flex flex-col items-center justify-center text-center px-4">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900">{t.noDownloads}</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-sm">{t.noDownloadsHint}</p>
            {/* The home-screen app can't see lessons saved in Safari. */}
            {iosContext === "installed" && (
              <p className="mt-3 max-w-sm text-sm font-medium text-amber-800">{IOS_STORAGE_COPY[language].appEmpty}</p>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {lessons.map((lesson) => {
              const title = pick(language, lesson.title_ar, lesson.title_en);
              const subject = pick(language, lesson.subject_name_ar, lesson.subject_name_en);
              const state = downloads.get(lesson.id);
              const saving = state?.status === "downloading";
              const failed = state?.status === "error";
              const noAudio = missingAudio.has(lesson.id);
              // Saved before schema 2 (no pictures, no practice gate): offer the update too.
              const outdated =
                updateAvailableIds.has(lesson.id) || lesson.updateAvailable === true || lesson.schema !== 2;
              const percent = Math.round(state?.progress ?? 0);
              // Saved, but the pages that open it offline aren't cached yet.
              const almostReady = !saving && !noAudio && !outdated && !offlineReady;
              const badge = saving
                ? { text: `${t.saving} ${percent}%`, tone: "bg-[#007229]/10 text-[#007229]" }
                : noAudio
                  ? { text: t.needsRedownload, tone: "bg-red-50 text-red-700" }
                  : outdated
                    ? { text: t.updateAvailable, tone: "bg-amber-50 text-amber-800" }
                    : almostReady
                      ? { text: t.almostReady, tone: "bg-amber-50 text-amber-800" }
                      : { text: t.ready, tone: "bg-emerald-50 text-emerald-700" };
              // Missing audio or a newer recording: save it again (online only).
              const refreshLabel = noAudio ? t.saveAgain : outdated ? t.update : failed ? t.retry : null;
              return (
                <article key={lesson.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex flex-col min-h-52">
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-bold font-fredoka text-gray-900 line-clamp-2 leading-snug">{title}</h3>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          {subject && (
                            <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-semibold">
                              {subject}
                            </span>
                          )}
                          <span className="px-2 py-1 rounded-lg bg-gray-50 text-gray-500 font-semibold">
                            {t.grade} {lesson.grade_level}
                          </span>
                        </div>
                      </div>
                      <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${badge.tone}`}>{badge.text}</span>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-500">
                      <div className="rounded-xl bg-gray-50 p-2">
                        <dt className="font-semibold">{t.savedOn}</dt>
                        <dd className="mt-0.5">{formatDate(lesson.downloadedAt, language)}</dd>
                      </div>
                      <div className="rounded-xl bg-gray-50 p-2">
                        <dt className="font-semibold">{t.size}</dt>
                        <dd className="mt-0.5">{formatBytes((lesson.audioSize || 0) + (lesson.assetBytes || 0))}</dd>
                      </div>
                    </dl>
                    {saving && <ProgressBar percent={percent} />}
                    {almostReady && (
                      <p className="mt-3 text-xs font-medium text-amber-700">{t.almostReadyHint}</p>
                    )}
                    {saving && <p className="mt-2 text-xs text-gray-500">{KEEP_OPEN_WHILE_SAVING[language]}</p>}
                    {failed && !saving && (
                      <p className="mt-3 text-xs font-medium text-red-600">{downloadErrorMessage(state?.errorCode, language)}</p>
                    )}
                    {lesson.audioMayNotPlay && !noAudio && (
                      <p className="mt-3 text-xs font-medium text-amber-700">{AUDIO_FORMAT_WARNING[language]}</p>
                    )}
                    {Boolean(lesson.missingAssetUrls?.length) && !noAudio && (
                      <p className="mt-3 text-xs font-medium text-amber-700">{MISSING_IMAGES_WARNING[language]}</p>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {!noAudio &&
                      (isOnline ? (
                        <Link
                          href={`/lessons/${lesson.id}`}
                          className="flex-1 inline-flex min-h-10 items-center justify-center px-3 py-2 rounded-xl bg-[#007229] text-white text-sm font-bold hover:bg-[#005C22] transition-colors"
                        >
                          {t.play}
                        </Link>
                      ) : (
                        // A full page load: the offline player needs no connection.
                        <a
                          href={offlinePlayerUrl(lesson.id)}
                          className="flex-1 inline-flex min-h-10 items-center justify-center px-3 py-2 rounded-xl bg-[#007229] text-white text-sm font-bold hover:bg-[#005C22] transition-colors"
                        >
                          {t.play}
                        </a>
                      ))}
                    {refreshLabel && !saving && (
                      <button
                        type="button"
                        disabled={!isOnline}
                        title={isOnline ? undefined : t.needsInternet}
                        onClick={() => void handleSave(lesson.id)}
                        className={`${noAudio ? "flex-1 bg-[#007229] text-white hover:bg-[#005C22]" : "bg-amber-50 text-amber-800 hover:bg-amber-100"} inline-flex min-h-10 items-center justify-center px-3 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-50`}
                      >
                        {refreshLabel}
                      </button>
                    )}
                    {/* An update in progress can be stopped here as well as where it started. */}
                    {saving && (
                      <button
                        type="button"
                        onClick={() => cancelDownload(lesson.id)}
                        className="inline-flex min-h-10 items-center justify-center px-3 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold hover:bg-gray-200 transition-colors"
                      >
                        {t.cancel}
                      </button>
                    )}
                    {!noAudio && (
                      <LessonComputerDownloadButton
                        lessonId={lesson.id}
                        title={title}
                        videoUrl={lesson.videoUrl}
                        language={language}
                        iconOnly
                        getPayload={async () => {
                          if (!lesson.sim) return null;
                          const audioBlob = await getCachedSimAudio(lesson.id);
                          if (!audioBlob) return lesson.sim;
                          return {
                            ...lesson.sim,
                            audio_url: URL.createObjectURL(audioBlob),
                          };
                        }}
                        className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                      />
                    )}
                    <button
                      type="button"
                      disabled={removingId === lesson.id}
                      onClick={() => void handleRemove(lesson.id)}
                      className="min-h-10 px-3 py-2 rounded-xl bg-red-50 text-red-700 text-sm font-bold hover:bg-red-100 disabled:opacity-50"
                    >
                      {t.remove}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
