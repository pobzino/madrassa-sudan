"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { useInstallPlatform } from "@/components/pwa/AddToPhone";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOffline } from "@/contexts/OfflineContext";
import { AUDIO_FORMAT_WARNING, downloadErrorMessage } from "@/lib/offline/download-manager";
import { canSaveOfflineHere, iosStorageContext } from "@/lib/offline/support";
import { isIosDevice, subscribeToInstallPlatform } from "@/lib/pwa-install";

/**
 * "Save for offline": downloads a lesson so it plays later without internet.
 *
 * - `icon`: a round button for lesson cards (the label is its tooltip).
 * - `compact`: icon + one word, for the learning path's action row.
 * - `full`: icon + full label, for the lesson page's top bar.
 *
 * Once saved it only shows that it's saved (or offers an update when the
 * teacher re-recorded the lesson). Removing a saved lesson happens on the
 * Downloads page, never from a stray tap here.
 *
 * On iPhone each browser and the home-screen app keep their own storage, so
 * in a browser tab the label says where the lesson went. Where saved lessons
 * could never open offline (iPhone in-app browsers) nothing is offered.
 */

// Set once the "saved in Safari, not in the app" note was shown on this browser.
const IOS_SAVE_NOTE_KEY = "amal-ios-save-note-shown";

const COPY = {
  en: {
    save: "Save for offline",
    saveShort: "Save",
    saving: "Saving",
    saved: "Saved on this phone",
    savedSafari: "Saved in Safari on this phone",
    savedBrowser: "Saved in this browser",
    savedShort: "Saved",
    update: "Update saved copy",
    updateShort: "Update",
    retry: "Try saving again",
    retryShort: "Retry",
    needsInternet: "Connect to the internet to save this lesson",
    unsupportedIos: "To save lessons for offline, open Amal in Safari or the installed app",
    unsupported: "This browser can't save lessons for offline",
    firstSaveSafari:
      "Saved in Safari. The home-screen Amal app can't see these — if you add Amal to your home screen, open it there and save your lessons again.",
    firstSaveBrowser:
      "Saved in this browser. The home-screen Amal app can't see these — if you add Amal to your home screen, open it there and save your lessons again.",
  },
  ar: {
    save: "احفظ للمشاهدة بدون إنترنت",
    saveShort: "احفظ",
    saving: "جارٍ الحفظ",
    saved: "محفوظ على هذا الهاتف",
    savedSafari: "محفوظ في Safari على هذا الهاتف",
    savedBrowser: "محفوظ في هذا المتصفح",
    savedShort: "محفوظ",
    update: "حدّث النسخة المحفوظة",
    updateShort: "حدّث",
    retry: "حاول الحفظ مرة أخرى",
    retryShort: "أعد المحاولة",
    needsInternet: "اتصل بالإنترنت لحفظ هذا الدرس",
    unsupportedIos: "لحفظ الدروس للمشاهدة بدون إنترنت، افتح آمال في Safari أو في التطبيق المثبّت",
    unsupported: "لا يستطيع هذا المتصفح حفظ الدروس للمشاهدة بدون إنترنت",
    firstSaveSafari:
      "حُفظ في Safari. تطبيق آمال على الشاشة الرئيسية لا يرى هذه الدروس — إذا أضفت آمال إلى الشاشة الرئيسية، افتحه من هناك واحفظ دروسك مرة أخرى.",
    firstSaveBrowser:
      "حُفظ في هذا المتصفح. تطبيق آمال على الشاشة الرئيسية لا يرى هذه الدروس — إذا أضفت آمال إلى الشاشة الرئيسية، افتحه من هناك واحفظ دروسك مرة أخرى.",
  },
};

/** Shows the iPhone "saved in this browser only" note once per browser. */
function showIosSaveNoteOnce(message: string) {
  try {
    if (localStorage.getItem(IOS_SAVE_NOTE_KEY)) return;
    localStorage.setItem(IOS_SAVE_NOTE_KEY, String(Date.now()));
  } catch {
    // Storage blocked: skip the note rather than show it on every save.
    return;
  }
  toast.info(message, { duration: 12_000 });
}

const noPlatformSupport = () => false;

interface DownloadButtonProps {
  lessonId: string;
  variant?: "icon" | "compact" | "full";
  /** Size of the `icon` variant. */
  size?: "sm" | "md";
  className?: string;
  /** The page knows the saved copy is older than the server's recording. */
  updateAvailable?: boolean;
}

const DownloadIcon = ({ className }: { className: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
);

const CheckIcon = ({ className }: { className: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);

const RetryIcon = ({ className }: { className: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
  </svg>
);

function ProgressRing({ percent, radius, stroke }: { percent: number; radius: number; stroke: number }) {
  const circumference = 2 * Math.PI * radius;
  const box = (radius + stroke) * 2;
  return (
    <svg className="absolute inset-0 -rotate-90" viewBox={`0 0 ${box} ${box}`} aria-hidden="true">
      <circle
        cx={radius + stroke}
        cy={radius + stroke}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={circumference - (percent / 100) * circumference}
        strokeLinecap="round"
        className="text-[#007229] transition-all duration-300"
      />
    </svg>
  );
}

export default function DownloadButton({
  lessonId,
  variant = "icon",
  size = "md",
  className = "",
  updateAvailable = false,
}: DownloadButtonProps) {
  const { language } = useLanguage();
  const t = COPY[language];
  const { ready, downloads, downloadedLessonIds, updateAvailableIds, downloadLesson, isOnline } = useOffline();
  // Re-saved from here: the page's "outdated" hint no longer applies.
  const [resaved, setResaved] = useState(false);
  // Both are null/false until hydrated; nothing renders before `ready` anyway.
  const platform = useInstallPlatform();
  const canSaveHere = useSyncExternalStore(subscribeToInstallPlatform, canSaveOfflineHere, noPlatformSupport);
  const ios = platform !== null && isIosDevice();
  const iosContext = iosStorageContext(platform, ios);

  const download = downloads.get(lessonId);
  const isDownloaded = downloadedLessonIds.has(lessonId);
  const isDownloading = download?.status === "downloading";
  const hasError = download?.status === "error" && !isDownloading;
  const canUpdate = isDownloaded && ((updateAvailable && !resaved) || updateAvailableIds.has(lessonId));
  const progress = Math.max(0, Math.min(100, Math.round(download?.progress ?? 0)));
  const errorMessage = hasError ? downloadErrorMessage(download?.errorCode, language) : null;

  const handleClick = useCallback(
    async (event: React.MouseEvent) => {
      // Cards wrap this in a link; a tap here must not open the lesson.
      event.preventDefault();
      event.stopPropagation();
      if (isDownloading || !isOnline) return;

      const result = await downloadLesson(lessonId);
      if (result.status === "saved") setResaved(true);
      if (result.status === "failed") {
        toast.error(downloadErrorMessage(result.code, language));
      } else if (result.status === "saved" && result.lesson.audioMayNotPlay) {
        toast.warning(AUDIO_FORMAT_WARNING[language]);
      }
      // Families are nudged to add Amal to the home screen, where these
      // lessons won't be: say so once, after the first save in a tab.
      if (result.status === "saved" && (iosContext === "safari" || iosContext === "browser")) {
        showIosSaveNoteOnce(iosContext === "safari" ? t.firstSaveSafari : t.firstSaveBrowser);
      }
    },
    [downloadLesson, iosContext, isDownloading, isOnline, language, lessonId, t]
  );

  // Saved and current: a status, not a button.
  const showSaved = isDownloaded && !canUpdate && !isDownloading;
  // Until the phone's downloads were read, "Save" could flash on a saved lesson.
  if (!ready) return null;
  // Saved here, a lesson could never open offline: point to where it can.
  if (!canSaveHere && !isDownloading) {
    return variant === "full" ? (
      <span className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-gray-400 ${className}`}>
        <DownloadIcon className="h-4 w-4 shrink-0" />
        {ios ? t.unsupportedIos : t.unsupported}
      </span>
    ) : null;
  }
  // Offline, nothing can be saved; keep showing what already is.
  if (!isOnline && !isDownloaded && !isDownloading) {
    return variant === "full" ? (
      <span className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-gray-400 ${className}`}>
        <DownloadIcon className="h-4 w-4 shrink-0" />
        {t.needsInternet}
      </span>
    ) : null;
  }

  const savedLabel = iosContext === "safari" ? t.savedSafari : iosContext === "browser" ? t.savedBrowser : t.saved;
  const label = isDownloading
    ? `${t.saving} ${progress}%`
    : showSaved
      ? savedLabel
      : canUpdate
        ? t.update
        : hasError
          ? t.retry
          : t.save;
  const shortLabel = isDownloading
    ? `${progress}%`
    : showSaved
      ? t.savedShort
      : canUpdate
        ? t.updateShort
        : hasError
          ? t.retryShort
          : t.saveShort;
  const tooltip = errorMessage ? `${label} — ${errorMessage}` : label;

  if (variant === "icon") {
    const box = size === "sm" ? "w-8 h-8" : "w-10 h-10";
    const icon = size === "sm" ? "w-4 h-4" : "w-5 h-5";
    const tone = showSaved
      ? "bg-emerald-100 text-emerald-700"
      : isDownloading
        ? "bg-white text-[#007229]"
        : hasError
          ? "bg-red-100 text-red-600 hover:bg-red-200"
          : canUpdate
            ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
            : "bg-white/95 text-gray-600 hover:bg-white hover:text-[#007229]";
    const content = isDownloading ? (
      <>
        <ProgressRing percent={progress} radius={size === "sm" ? 14 : 18} stroke={size === "sm" ? 2.5 : 3} />
        <span className="text-[10px] font-bold">{progress}%</span>
      </>
    ) : showSaved ? (
      <CheckIcon className={icon} />
    ) : hasError ? (
      <RetryIcon className={icon} />
    ) : (
      <DownloadIcon className={icon} />
    );

    if (showSaved || isDownloading) {
      return (
        <span
          role="status"
          aria-label={label}
          title={label}
          className={`relative flex-shrink-0 ${box} rounded-full flex items-center justify-center ${tone} ${className}`}
        >
          {content}
        </span>
      );
    }
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-label={tooltip}
        title={tooltip}
        className={`relative flex-shrink-0 ${box} rounded-full flex items-center justify-center transition-colors ${tone} ${className}`}
      >
        {content}
      </button>
    );
  }

  const compact = variant === "compact";
  const text = compact ? shortLabel : label;
  const shape = compact
    ? "gap-1 px-3 py-1 rounded-full text-[11px] font-bold font-fredoka shadow-sm"
    : "min-h-11 gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold";
  const iconClass = compact ? "h-3.5 w-3.5 shrink-0" : "h-4 w-4 shrink-0";
  const tone = showSaved
    ? "bg-emerald-50 text-emerald-700"
    : isDownloading
      ? "bg-[#007229]/10 text-[#007229]"
      : hasError
        ? "bg-red-50 text-red-700 hover:bg-red-100"
        : canUpdate
          ? "bg-amber-50 text-amber-800 hover:bg-amber-100"
          : compact
            ? "bg-white text-[#007229] hover:bg-[#007229]/10"
            : "bg-[#007229]/10 text-[#007229] hover:bg-[#007229]/15";

  if (showSaved || isDownloading) {
    return (
      <span
        role="status"
        aria-label={label}
        title={label}
        className={`relative inline-flex items-center overflow-hidden ${shape} ${tone} ${className}`}
      >
        {/* Fills from the start edge as the download progresses. */}
        {isDownloading && (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 start-0 bg-[#007229]/15 transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        )}
        <span className={`relative inline-flex items-center ${compact ? "gap-1" : "gap-2"}`}>
          {showSaved ? <CheckIcon className={iconClass} /> : <DownloadIcon className={`${iconClass} animate-pulse`} />}
          {text}
        </span>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={tooltip}
      title={tooltip}
      className={`inline-flex items-center transition-colors ${shape} ${tone} ${className}`}
    >
      {hasError ? <RetryIcon className={iconClass} /> : <DownloadIcon className={iconClass} />}
      {text}
    </button>
  );
}
