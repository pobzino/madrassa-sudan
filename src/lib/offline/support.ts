// Whether this browser can keep lessons for offline, and on iPhone which
// storage they go to. On iPhone, Safari, every other browser, every in-app
// browser and the home-screen app each keep their own storage: a lesson saved
// in one never shows in another. (Android's installed app shares Chrome's.)

import { currentInstallPlatform, type InstallPlatform } from "@/lib/pwa-install";

export type IosStorageContext = "safari" | "browser" | "in-app" | "installed";

/** Which iPhone storage this page uses, or null on other phones. Pure, for tests. */
export function iosStorageContext(platform: InstallPlatform | null, ios: boolean): IosStorageContext | null {
  switch (platform) {
    case "ios-safari":
      return "safari";
    case "ios-browser":
      return "browser";
    case "ios-in-app":
      return "in-app";
    case "installed":
      return ios ? "installed" : null;
    default:
      return null;
  }
}

/**
 * Whether a lesson saved here can open later with no connection. That needs a
 * service worker (to load any page offline), Cache Storage and IndexedDB.
 * iPhone in-app browsers (Instagram, Facebook…) have no service worker, and
 * what they store stays inside that app. Pure, for tests.
 */
export function offlineSaveSupported(env: {
  secureContext: boolean;
  serviceWorker: boolean;
  cacheStorage: boolean;
  indexedDB: boolean;
  platform: InstallPlatform | null;
}): boolean {
  return env.secureContext && env.serviceWorker && env.cacheStorage && env.indexedDB && env.platform !== "ios-in-app";
}

/**
 * offlineSaveSupported for this browser; false on the server. Doesn't need
 * the worker to control the page yet (it doesn't on the first visit).
 */
export function canSaveOfflineHere(): boolean {
  if (typeof window === "undefined") return false;
  return offlineSaveSupported({
    secureContext: window.isSecureContext === true,
    serviceWorker: "serviceWorker" in navigator,
    cacheStorage: typeof caches !== "undefined",
    indexedDB: typeof indexedDB !== "undefined",
    platform: currentInstallPlatform(),
  });
}

/** Shared by the saved-lessons hub (/offline) and the Downloads page. */
export const IOS_STORAGE_COPY = {
  en: {
    tabNote: {
      safari:
        "On iPhone, lessons saved in Safari stay in Safari: the home-screen app can't see them, and Safari may delete them after about a week without opening Amal. Save lessons inside the installed app.",
      other:
        "On iPhone, lessons saved in this browser stay in this browser: the home-screen app can't see them, and they may be deleted after about a week without opening Amal. Save lessons inside the installed app.",
    },
    appEmpty: "Lessons saved in Safari don't show in the app. When you're online, open a lesson here and tap Save.",
  },
  ar: {
    tabNote: {
      safari:
        "على iPhone، تبقى الدروس المحفوظة في Safari داخل Safari: تطبيق آمال على الشاشة الرئيسية لا يراها، وقد يحذفها Safari إذا لم تفتح آمال لمدة أسبوع تقريبًا. احفظ الدروس داخل التطبيق المثبّت.",
      other:
        "على iPhone، تبقى الدروس المحفوظة في هذا المتصفح داخله: تطبيق آمال على الشاشة الرئيسية لا يراها، وقد تُحذف إذا لم تفتح آمال لمدة أسبوع تقريبًا. احفظ الدروس داخل التطبيق المثبّت.",
    },
    appEmpty: "الدروس المحفوظة في Safari لا تظهر في التطبيق. عندما تكون متصلاً بالإنترنت، افتح درساً هنا واضغط «احفظ».",
  },
} as const;

/** The iPhone browser-tab note for `context`, or null where it doesn't apply. */
export function iosTabNote(context: IosStorageContext | null, language: "ar" | "en"): string | null {
  if (!context || context === "installed") return null;
  return IOS_STORAGE_COPY[language].tabNote[context === "safari" ? "safari" : "other"];
}
