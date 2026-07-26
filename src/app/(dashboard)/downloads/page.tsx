"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOffline } from "@/contexts/OfflineContext";
import { getAllOfflineLessons, getCachedSimAudio, type OfflineLesson } from "@/lib/offline/db";
import LessonComputerDownloadButton from "@/components/lessons/LessonComputerDownloadButton";

const translations = {
  ar: {
    title: "التحميلات",
    subtitle: "الدروس المحفوظة على هذا الجهاز",
    online: "متصل",
    offline: "بدون إنترنت",
    storage: "المساحة المستخدمة",
    unavailable: "غير متاح",
    downloadedLessons: "الدروس المحملة",
    activeDownloads: "تحميلات نشطة",
    noDownloads: "لا توجد دروس محملة بعد",
    noDownloadsHint: "ستظهر الدروس المحفوظة هنا.",
    browseLessons: "تصفح الدروس",
    downloadFile: "تحميل MP4",
    open: "فتح",
    remove: "حذف",
    retry: "إعادة المحاولة",
    cancel: "إلغاء",
    downloading: "جاري التحميل",
    failed: "فشل التحميل",
    completed: "مكتمل",
    grade: "الصف",
    downloaded: "تم التحميل",
    confirmRemove: "حذف هذا الدرس من التحميلات؟",
    unknownLesson: "درس",
    audio: "الصوت",
  },
  en: {
    title: "Downloads",
    subtitle: "Lessons saved on this device",
    online: "Online",
    offline: "Offline",
    storage: "Storage used",
    unavailable: "Unavailable",
    downloadedLessons: "Downloaded lessons",
    activeDownloads: "Active downloads",
    noDownloads: "No downloaded lessons yet",
    noDownloadsHint: "Saved lessons will appear here.",
    browseLessons: "Browse lessons",
    downloadFile: "Download MP4",
    open: "Open",
    remove: "Remove",
    retry: "Retry",
    cancel: "Cancel",
    downloading: "Downloading",
    failed: "Download failed",
    completed: "Completed",
    grade: "Grade",
    downloaded: "Downloaded",
    confirmRemove: "Remove this lesson from downloads?",
    unknownLesson: "Lesson",
    audio: "Audio",
  },
};

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

export default function DownloadsPage() {
  const { language } = useLanguage();
  const t = translations[language];
  const isRtl = language === "ar";
  const {
    isOnline,
    downloads,
    downloadedLessonIds,
    storageUsed,
    storageQuota,
    downloadLesson,
    cancelDownload,
    deleteLesson,
    refreshDownloads,
  } = useOffline();
  const [lessons, setLessons] = useState<OfflineLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadLessons = useCallback(async () => {
    setLoading(true);
    try {
      const saved = await getAllOfflineLessons();
      saved.sort((a, b) => Date.parse(b.downloadedAt) - Date.parse(a.downloadedAt));
      setLessons(saved);
    } catch {
      setLessons([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshDownloads();
    void loadLessons();
  }, [refreshDownloads, loadLessons]);

  useEffect(() => {
    void loadLessons();
  }, [downloadedLessonIds, loadLessons]);

  const activeDownloads = useMemo(
    () =>
      Array.from(downloads.values()).filter(
        (download) => download.status !== "completed"
      ),
    [downloads]
  );

  const usedPercent = storageQuota > 0 ? Math.min(100, Math.round((storageUsed / storageQuota) * 100)) : 0;
  const downloadedAudioBytes = lessons.reduce((total, lesson) => total + (lesson.audioSize || 0), 0);

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

      <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr] mb-6">
        <section className={`bg-white border border-gray-100 rounded-2xl p-4 shadow-sm ${activeDownloads.length === 0 ? "md:col-span-2" : ""}`}>
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
              {lessons.length} {t.downloadedLessons}
            </span>
            <span className="px-2 py-1 rounded-lg bg-gray-50">
              {t.audio}: {formatBytes(downloadedAudioBytes)}
            </span>
          </div>
        </section>

        {activeDownloads.length > 0 && (
          <section className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <h2 className="text-sm font-bold text-gray-800 mb-3">{t.activeDownloads}</h2>
            <div className="space-y-3">
              {activeDownloads.map((download) => {
                const isDownloading = download.status === "downloading";
                return (
                  <div key={download.lessonId} className="rounded-xl border border-gray-100 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">
                          {t.unknownLesson} {download.lessonId.slice(0, 8)}
                        </p>
                        <p className={`text-xs ${download.status === "error" ? "text-red-500" : "text-gray-500"}`}>
                          {download.status === "error" ? download.error || t.failed : `${t.downloading} ${download.progress}%`}
                        </p>
                      </div>
                      {isDownloading ? (
                        <button
                          type="button"
                          onClick={() => cancelDownload(download.lessonId)}
                          className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-bold hover:bg-gray-200"
                        >
                          {t.cancel}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!isOnline}
                          onClick={() => void downloadLesson(download.lessonId)}
                          className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-bold hover:bg-red-100 disabled:opacity-50"
                        >
                          {t.retry}
                        </button>
                      )}
                    </div>
                    {isDownloading && (
                      <div className="mt-3 h-2 rounded-full bg-blue-50 overflow-hidden">
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${download.progress}%` }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <section>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-lg font-bold font-fredoka text-gray-900">{t.downloadedLessons}</h2>
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
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {lessons.map((lesson) => {
              const title = (language === "ar" ? lesson.title_ar : lesson.title_en) || lesson.title_ar || lesson.title_en;
              const subject = language === "ar" ? lesson.subject_name_ar : lesson.subject_name_en;
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
                      <span className="w-9 h-9 flex-shrink-0 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </span>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-500">
                      <div className="rounded-xl bg-gray-50 p-2">
                        <dt className="font-semibold">{t.downloaded}</dt>
                        <dd className="mt-0.5">{formatDate(lesson.downloadedAt, language)}</dd>
                      </div>
                      <div className="rounded-xl bg-gray-50 p-2">
                        <dt className="font-semibold">{t.audio}</dt>
                        <dd className="mt-0.5">{formatBytes(lesson.audioSize)}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <LessonComputerDownloadButton
                      lessonId={lesson.id}
                      title={title}
                      videoUrl={lesson.videoUrl}
                      language={language}
                      getPayload={async () => {
                        if (!lesson.sim) return null;
                        const audioBlob = await getCachedSimAudio(lesson.id);
                        if (!audioBlob) return lesson.sim;
                        return {
                          ...lesson.sim,
                          audio_url: URL.createObjectURL(audioBlob),
                        };
                      }}
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-blue-50 text-blue-700 text-sm font-bold hover:bg-blue-100 transition-colors"
                    />
                    <Link
                      href={`/lessons/${lesson.id}`}
                      className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-xl bg-[#007229] text-white text-sm font-bold hover:bg-[#005C22] transition-colors"
                    >
                      {t.open}
                    </Link>
                    <button
                      type="button"
                      disabled={removingId === lesson.id}
                      onClick={() => void handleRemove(lesson.id)}
                      className="px-3 py-2 rounded-xl bg-red-50 text-red-700 text-sm font-bold hover:bg-red-100 disabled:opacity-50"
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
