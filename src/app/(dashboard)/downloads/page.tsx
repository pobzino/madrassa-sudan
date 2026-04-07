"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useOffline } from "@/contexts/OfflineContext";
import { getAllOfflineLessons, type OfflineLesson } from "@/lib/offline/db";
import { useLanguage } from "@/contexts/LanguageContext";
import { OwlSad } from "@/components/illustrations";

const translations = {
  ar: {
    title: "التحميلات",
    subtitle: "الدروس المحفوظة للدراسة بدون إنترنت",
    storage: "التخزين",
    used: "مستخدم",
    of: "من",
    deleteAll: "حذف الكل",
    deleteConfirm: "اضغط مرة أخرى للتأكيد",
    empty: "لا توجد دروس محملة",
    emptyHint: "يمكنك تحميل الدروس من صفحة الدروس",
    browseLessons: "تصفح الدروس",
    downloaded: "تم التحميل",
    remove: "إزالة",
  },
  en: {
    title: "Downloads",
    subtitle: "Lessons saved for offline study",
    storage: "Storage",
    used: "used",
    of: "of",
    deleteAll: "Delete All",
    deleteConfirm: "Tap again to confirm",
    empty: "No lessons downloaded",
    emptyHint: "Download lessons from the Lessons page to study offline",
    browseLessons: "Browse Lessons",
    downloaded: "Downloaded",
    remove: "Remove",
  },
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default function DownloadsPage() {
  const { language } = useLanguage();
  const t = translations[language];
  const { storageUsed, storageQuota, deleteLesson, refreshDownloads } =
    useOffline();
  const [lessons, setLessons] = useState<OfflineLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadLessons();
  }, []);

  async function loadLessons() {
    try {
      const all = await getAllOfflineLessons();
      setLessons(all.sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt)));
    } catch {
      // IndexedDB not available
    }
    setLoading(false);
  }

  async function handleDelete(lessonId: string) {
    setDeletingId(lessonId);
    await deleteLesson(lessonId);
    setLessons((prev) => prev.filter((l) => l.id !== lessonId));
    setDeletingId(null);
  }

  async function handleDeleteAll() {
    if (!deleteAllConfirm) {
      setDeleteAllConfirm(true);
      setTimeout(() => setDeleteAllConfirm(false), 3000);
      return;
    }
    setDeleteAllConfirm(false);
    for (const lesson of lessons) {
      await deleteLesson(lesson.id);
    }
    setLessons([]);
    await refreshDownloads();
  }

  const storagePercent =
    storageQuota > 0 ? Math.round((storageUsed / storageQuota) * 100) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-3 border-gray-200 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-fredoka text-gray-900">
          {t.title}
        </h1>
        <p className="text-sm text-gray-500 mt-1">{t.subtitle}</p>
      </div>

      {/* Storage bar */}
      {storageQuota > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              {t.storage}
            </span>
            <span className="text-xs text-gray-500">
              {formatBytes(storageUsed)} {t.used} {t.of}{" "}
              {formatBytes(storageQuota)}
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                storagePercent > 90
                  ? "bg-red-500"
                  : storagePercent > 70
                    ? "bg-amber-500"
                    : "bg-emerald-500"
              }`}
              style={{ width: `${Math.min(storagePercent, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Lessons list */}
      {lessons.length === 0 ? (
        <div className="text-center py-16">
          <OwlSad className="w-20 h-20 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            {t.empty}
          </h3>
          <p className="text-sm text-gray-500 mb-6">{t.emptyHint}</p>
          <Link
            href="/lessons"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#007229] text-white font-semibold rounded-xl hover:bg-[#005C22] transition-colors"
          >
            {t.browseLessons}
          </Link>
        </div>
      ) : (
        <>
          {/* Delete all button */}
          <div className="flex justify-end mb-4">
            <button
              onClick={handleDeleteAll}
              className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
                deleteAllConfirm
                  ? "bg-red-100 text-red-700 hover:bg-red-200"
                  : "text-gray-500 hover:text-red-600 hover:bg-red-50"
              }`}
            >
              {deleteAllConfirm ? t.deleteConfirm : t.deleteAll}
            </button>
          </div>

          <div className="space-y-3">
            {lessons.map((lesson) => (
              <div
                key={lesson.id}
                className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4"
              >
                <Link
                  href={`/lessons/${lesson.id}`}
                  className="flex-1 min-w-0"
                >
                  <h3 className="font-semibold text-gray-900 truncate">
                    {language === "ar" ? lesson.title_ar : lesson.title_en}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    {(language === "ar"
                      ? lesson.subject_name_ar
                      : lesson.subject_name_en) && (
                      <span className="text-xs text-gray-500">
                        {language === "ar"
                          ? lesson.subject_name_ar
                          : lesson.subject_name_en}
                      </span>
                    )}
                    {lesson.audioSize > 0 && (
                      <span className="text-xs text-gray-400">
                        {formatBytes(lesson.audioSize)}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {new Date(lesson.downloadedAt).toLocaleDateString()}
                    </span>
                  </div>
                </Link>

                <div className="flex items-center gap-2">
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-lg">
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                    {t.downloaded}
                  </span>
                  <button
                    onClick={() => handleDelete(lesson.id)}
                    disabled={deletingId === lesson.id}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title={t.remove}
                  >
                    {deletingId === lesson.id ? (
                      <div className="w-4 h-4 border-2 border-gray-200 border-t-red-500 rounded-full animate-spin" />
                    ) : (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
