"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { trackAnalyticsEvent } from "@/lib/analytics";
import {
  currentInstallPlatform,
  openInChromeUrl,
  promptInstall,
  subscribeToInstallPlatform,
  type InstallPlatform,
} from "@/lib/pwa-install";

export type InstallSource = "signup" | "lesson" | "dashboard" | "app_page";

/** The phone's install route, or null before the page has loaded in the browser. */
export function useInstallPlatform(): InstallPlatform | null {
  return useSyncExternalStore(subscribeToInstallPlatform, currentInstallPlatform, () => null);
}

const COPY = {
  en: {
    oneTapButton: "Add Amal to my phone",
    oneTapHint: "Then tap Install. It's free and only takes a moment.",
    done: "Done! You'll find the Amal owl on your home screen.",
    dismissed: "No problem. You can add it any time from your account.",
    installed: "Amal is already on this phone. Open it from your home screen.",
    iosSafari: ["Tap the Share button at the bottom of Safari.", "Scroll down and tap Add to Home Screen.", "Tap Add."],
    iosSafariNote: "On newer iPhones, tap ⋯ first, then Share.",
    iosBrowser: ["Tap the Share button next to the address bar.", "Tap Add to Home Screen.", "Tap Add."],
    android: ["Tap the menu ⋮ at the top of the screen.", "Tap Add to Home screen or Install app.", "Tap Add or Install."],
    androidInApp: "This page is open inside another app, which can't add Amal to your phone. Open it in Chrome first.",
    samsung: "Samsung's browser adds apps in an old format that Google Play Protect blocks. Open Amal in Chrome to add it safely.",
    openInChrome: "Open in Chrome",
    iosInApp: "This page is open inside another app. Tap ⋯ or the compass icon, choose Open in Safari, then add Amal from there.",
    copyLink: "Copy link",
    copied: "Link copied",
    desktop: "Amal works best as an app on your phone. Open this link on your phone:",
    add: "Add",
    install: "Install",
  },
  ar: {
    oneTapButton: "أضف آمال إلى هاتفي",
    oneTapHint: "ثم اضغط «تثبيت». مجاني ويستغرق لحظات.",
    done: "تم! ستجد بومة آمال على الشاشة الرئيسية لهاتفك.",
    dismissed: "لا مشكلة. يمكنك إضافته في أي وقت من حسابك.",
    installed: "آمال موجود على هذا الهاتف بالفعل. افتحه من الشاشة الرئيسية.",
    iosSafari: ["اضغط زر المشاركة أسفل Safari.", "مرّر للأسفل واضغط «إضافة إلى الشاشة الرئيسية».", "اضغط «إضافة»."],
    iosSafariNote: "في أجهزة iPhone الأحدث، اضغط ⋯ أولاً ثم «مشاركة».",
    iosBrowser: ["اضغط زر المشاركة بجانب شريط العنوان.", "اضغط «إضافة إلى الشاشة الرئيسية».", "اضغط «إضافة»."],
    android: ["اضغط على القائمة ⋮ في أعلى الشاشة.", "اضغط «إضافة إلى الشاشة الرئيسية» أو «تثبيت التطبيق».", "اضغط «إضافة» أو «تثبيت»."],
    androidInApp: "هذه الصفحة مفتوحة داخل تطبيق آخر لا يمكنه إضافة آمال إلى هاتفك. افتحها في Chrome أولاً.",
    samsung: "متصفح سامسونج يضيف التطبيقات بصيغة قديمة يحظرها Google Play Protect. افتح آمال في Chrome لإضافته بأمان.",
    openInChrome: "افتح في Chrome",
    iosInApp: "هذه الصفحة مفتوحة داخل تطبيق آخر. اضغط ⋯ أو أيقونة البوصلة، واختر «فتح في Safari»، ثم أضف آمال من هناك.",
    copyLink: "انسخ الرابط",
    copied: "تم نسخ الرابط",
    desktop: "آمال أفضل كتطبيق على هاتفك. افتح هذا الرابط على هاتفك:",
    add: "إضافة",
    install: "تثبيت",
  },
};

/** What each step's button looks like on the phone, so parents can spot it. */
function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 px-2.5 text-[#007AFF] ring-1 ring-gray-200">
      {children}
    </span>
  );
}

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3v12M8 7l4-4 4 4" />
    <path d="M8 11H6.5A1.5 1.5 0 0 0 5 12.5v7A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5H16" />
  </svg>
);

const AddSquareIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <path d="M12 8.5v7M8.5 12h7" />
  </svg>
);

const MenuDotsIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6 text-gray-700" fill="currentColor" aria-hidden>
    <circle cx="12" cy="5" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="19" r="2" />
  </svg>
);

const PhoneAddIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6 text-gray-700" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
    <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
    <path d="M12 9v6M9 12h6" />
  </svg>
);

function Steps({ steps, chips, note }: { steps: string[]; chips: ReactNode[]; note?: string }) {
  return (
    <ol className="space-y-2.5">
      {steps.map((step, i) => (
        <li key={step} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-gray-100">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#007229] font-fredoka text-base font-bold text-white">
            {i + 1}
          </span>
          <span className="flex-1 text-[15px] font-semibold leading-snug text-gray-800">
            {step}
            {i === 0 && note && <span className="mt-0.5 block text-xs font-normal text-gray-500">{note}</span>}
          </span>
          {chips[i]}
        </li>
      ))}
    </ol>
  );
}

/**
 * The simplest way to put Amal on this phone: one button where the browser
 * allows it, otherwise a few pictured steps for the exact phone and browser.
 */
export function AddToPhone({ source, onInstalled }: { source: InstallSource; onInstalled?: () => void }) {
  const { language } = useLanguage();
  const t = COPY[language];
  const platform = useInstallPlatform();
  const [result, setResult] = useState<"accepted" | "dismissed" | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (platform && platform !== "installed") trackAnalyticsEvent("app_install_view", { source, platform });
    // Count each view once per platform, not on every render.
  }, [platform, source]);

  if (!platform) return null;

  const appLink = `${window.location.origin}/app?lang=${language}`;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(appLink);
      setCopied(true);
    } catch {
      window.prompt(t.copyLink, appLink);
    }
  };

  if (result === "accepted" || platform === "installed") {
    return (
      <p className="rounded-2xl bg-white p-4 text-center font-fredoka text-lg font-bold text-[#007229] shadow-sm ring-1 ring-[#cfe9d6]">
        {result === "accepted" ? t.done : t.installed}
      </p>
    );
  }

  if (platform === "one-tap") {
    const install = async () => {
      trackAnalyticsEvent("app_install_click", { source, platform });
      const outcome = await promptInstall();
      if (outcome === "unavailable") return;
      trackAnalyticsEvent("app_install_result", { source, platform, outcome });
      setResult(outcome);
      if (outcome === "accepted") onInstalled?.();
    };
    return (
      <div className="text-center">
        <button
          type="button"
          onClick={install}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#007229] px-6 py-4 font-fredoka text-lg font-bold text-white shadow-[0_4px_0_#005C22] transition-transform active:translate-y-0.5 active:shadow-[0_2px_0_#005C22]"
        >
          <PhoneAddIcon />
          {t.oneTapButton}
        </button>
        <p className="mt-3 text-sm text-gray-600">{result === "dismissed" ? t.dismissed : t.oneTapHint}</p>
      </div>
    );
  }

  if (platform === "android-in-app" || platform === "android-samsung" || platform === "ios-in-app") {
    const message = { "android-in-app": t.androidInApp, "android-samsung": t.samsung, "ios-in-app": t.iosInApp }[platform];
    return (
      <div className="space-y-3 text-center">
        <p className="text-[15px] leading-relaxed text-gray-700">{message}</p>
        {platform !== "ios-in-app" && (
          <a
            href={openInChromeUrl(window.location.origin, `/app?lang=${language}`)}
            onClick={() => trackAnalyticsEvent("app_install_click", { source, platform })}
            className="inline-flex w-full items-center justify-center rounded-2xl bg-[#007229] px-6 py-4 font-fredoka text-lg font-bold text-white shadow-[0_4px_0_#005C22]"
          >
            {t.openInChrome}
          </a>
        )}
        <button
          type="button"
          onClick={copyLink}
          className="inline-flex w-full items-center justify-center rounded-2xl bg-white px-6 py-3 font-fredoka font-bold text-[#007229] ring-2 ring-[#007229]/30"
        >
          {copied ? t.copied : t.copyLink}
        </button>
      </div>
    );
  }

  if (platform === "desktop") {
    return (
      <div className="text-center">
        <p className="text-[15px] text-gray-700">{t.desktop}</p>
        <p className="mt-2 font-fredoka text-2xl font-bold text-[#007229]" dir="ltr">
          {window.location.host}/app
        </p>
      </div>
    );
  }

  // Chrome before it offers one-tap install: its menu works straight away.
  if (platform === "android-menu" || platform === "android-chrome-waiting") {
    return (
      <Steps
        steps={t.android}
        chips={[
          <Chip key="menu"><MenuDotsIcon /></Chip>,
          <Chip key="add"><PhoneAddIcon /></Chip>,
          <Chip key="confirm"><span className="text-sm font-bold text-[#1a73e8]">{t.install}</span></Chip>,
        ]}
      />
    );
  }

  return (
    <Steps
      steps={platform === "ios-browser" ? t.iosBrowser : t.iosSafari}
      note={platform === "ios-safari" ? t.iosSafariNote : undefined}
      chips={[
        <Chip key="share"><ShareIcon /></Chip>,
        <Chip key="add"><AddSquareIcon /></Chip>,
        <Chip key="confirm"><span className="text-sm font-bold">{t.add}</span></Chip>,
      ]}
    />
  );
}
