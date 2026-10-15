// Helps families put Amal on their phone's home screen, so lessons open in one
// tap like an app. Browsers that can install with one tap (Chrome, Edge and
// Samsung Internet on Android) fire `beforeinstallprompt` once per page load,
// often before React has rendered, so it's caught here as soon as this module
// loads (ServiceWorkerRegister imports it in the root layout).

import { trackAnalyticsEvent } from "@/lib/analytics";

type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** How this phone or browser adds Amal to the home screen. */
export type InstallPlatform =
  /** Already open from the home screen. */
  | "installed"
  /** The browser installs with one tap of our button. */
  | "one-tap"
  /** An Android browser without one-tap install: use its ⋮ menu. */
  | "android-menu"
  /**
   * Chrome or Edge on Android before they offer one-tap install. Chrome only
   * fires `beforeinstallprompt` once someone has spent ~30 seconds on the site
   * and tapped something, so offers wait for it rather than showing menu steps.
   */
  | "android-chrome-waiting"
  | "ios-safari"
  /** Chrome, Edge or Firefox on iPhone: the share button is in the address bar. */
  | "ios-browser"
  /** Inside WhatsApp, Facebook, Instagram and the like, which can't install: open in Chrome. */
  | "android-in-app"
  /**
   * Samsung Internet. It installs apps in an old Android format that Google
   * Play Protect blocks as unsafe, so families are sent to Chrome instead.
   */
  | "android-samsung"
  /** The same on iPhone: open in Safari. */
  | "ios-in-app"
  | "desktop";

// Chromium browsers on Android that offer one-tap install (Chrome, Edge), but not
// the many that share Chrome's user agent without supporting it.
const OTHER_ANDROID_BROWSER = /OPR\/|MiuiBrowser|UCBrowser|YaBrowser|HuaweiBrowser|HeyTapBrowser|VivoBrowser|Firefox/i;

const IN_APP_BROWSER = /FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|TikTok|musical_ly|Twitter|LinkedInApp|GSA\/|WhatsApp|; wv\)/i;

export function classifyBrowser(
  userAgent: string,
  { standalone, canPrompt, touchPoints = 0 }: { standalone: boolean; canPrompt: boolean; touchPoints?: number },
): InstallPlatform {
  if (standalone) return "installed";
  // iPads report a Mac user agent, but have touch.
  const ios = /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && touchPoints > 1);
  const android = /Android/i.test(userAgent);
  if (IN_APP_BROWSER.test(userAgent) && (ios || android)) return ios ? "ios-in-app" : "android-in-app";
  if (android && /SamsungBrowser/i.test(userAgent)) return "android-samsung";
  if (canPrompt) return "one-tap";
  if (android && /Chrome\//.test(userAgent) && !OTHER_ANDROID_BROWSER.test(userAgent)) return "android-chrome-waiting";
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent) ? "ios-browser" : "ios-safari";
  if (android) return "android-menu";
  return "desktop";
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedThisVisit = false;
// Set when Chrome reports Amal is already installed on this phone, while it's open in a browser tab.
let installedElsewhere = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function currentInstallPlatform(): InstallPlatform {
  return classifyBrowser(navigator.userAgent, {
    standalone: installedThisVisit || installedElsewhere || isStandalone(),
    canPrompt: Boolean(deferredPrompt),
    touchPoints: navigator.maxTouchPoints,
  });
}

export function subscribeToInstallPlatform(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Hold the browser's own banner back; we offer the install at a better moment.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  // Chrome on Android can say whether this site is already installed (the
  // manifest lists itself under related_applications), so we don't offer again.
  const related = (navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> }).getInstalledRelatedApps;
  related
    ?.call(navigator)
    .then((apps) => {
      if (apps.length) {
        installedElsewhere = true;
        notify();
      }
    })
    .catch(() => undefined);
  window.addEventListener("appinstalled", () => {
    installedThisVisit = true;
    deferredPrompt = null;
    trackAnalyticsEvent("app_installed");
    notify();
  });
}

/** Shows the browser's install box. Each prompt can only be used once. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = deferredPrompt;
  if (!event) return "unavailable";
  deferredPrompt = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  notify();
  return outcome;
}

/** Counts each visit that starts from the home-screen app. */
export function trackAppLaunch() {
  try {
    if (!isStandalone() || sessionStorage.getItem("amal-app-launch")) return;
    sessionStorage.setItem("amal-app-launch", "1");
    trackAnalyticsEvent("app_launch");
  } catch {
    // Storage can be unavailable in private or locked-down browsers.
  }
}

/** Chrome on Android can open a page straight from an in-app browser with an intent link. */
export function openInChromeUrl(origin: string, path: string) {
  const url = new URL(path, origin);
  const fallback = encodeURIComponent(url.toString());
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
}

// When to ask. The dashboard shows the install sheet once after sign-up and
// once after the first completed lesson; each reason is only ever asked once.

export type InstallNudgeReason = "signup" | "lesson";

const PENDING_KEY = "amal-install-pending";
const askedKey = (reason: InstallNudgeReason) => `amal-install-asked-${reason}`;
const CARD_HIDDEN_KEY = "amal-install-card-hidden-until";

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Asks the dashboard to offer the install next time it opens, unless we already have. */
export function requestInstallNudge(reason: InstallNudgeReason) {
  const store = storage();
  if (!store || store.getItem(askedKey(reason))) return;
  store.setItem(PENDING_KEY, reason);
}

export function pendingInstallNudge(): InstallNudgeReason | null {
  const value = storage()?.getItem(PENDING_KEY);
  return value === "signup" || value === "lesson" ? value : null;
}

/** Records that we asked, so the same reason never asks twice. */
export function markInstallNudgeShown(reason: InstallNudgeReason) {
  const store = storage();
  if (!store) return;
  store.setItem(askedKey(reason), String(Date.now()));
  if (store.getItem(PENDING_KEY) === reason) store.removeItem(PENDING_KEY);
}

export function isInstallCardHidden() {
  return Number(storage()?.getItem(CARD_HIDDEN_KEY) ?? 0) > Date.now();
}

export function hideInstallCard(days = 30) {
  storage()?.setItem(CARD_HIDDEN_KEY, String(Date.now() + days * 24 * 60 * 60 * 1000));
}
