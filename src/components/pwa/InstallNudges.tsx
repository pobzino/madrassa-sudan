"use client";

import { useEffect, useState } from "react";
import { OwlWaving } from "@/components/illustrations";
import { useLanguage } from "@/contexts/LanguageContext";
import { trackAnalyticsEvent } from "@/lib/analytics";
import {
  hideInstallCard,
  isInstallCardHidden,
  markInstallNudgeShown,
  pendingInstallNudge,
  promptInstall,
} from "@/lib/pwa-install";
import { AddToPhone, useInstallPlatform, type InstallSource } from "./AddToPhone";

const COPY = {
  en: {
    title: {
      signup: "One last step: put Amal on your phone",
      lesson: "First lesson done! Keep Amal one tap away",
      dashboard: "Put Amal on your phone",
      app_page: "Put Amal on your phone",
    },
    subtitle: "Open your lessons in one tap, like an app. It's free, and there's no app store.",
    notNow: "Not now",
    cardTitle: "Add Amal to your phone",
    cardBody: "Open your lessons in one tap, like an app.",
    cardAdd: "Add",
    cardHow: "Show me how",
    hideCard: "Hide",
  },
  ar: {
    title: {
      signup: "خطوة أخيرة: ضع آمال على هاتفك",
      lesson: "أكملت أول درس! اجعل آمال على بُعد لمسة",
      dashboard: "ضع آمال على هاتفك",
      app_page: "ضع آمال على هاتفك",
    },
    subtitle: "افتح دروسك بلمسة واحدة مثل أي تطبيق. مجاني، ولا حاجة لمتجر التطبيقات.",
    notNow: "ليس الآن",
    cardTitle: "أضف آمال إلى هاتفك",
    cardBody: "افتح دروسك بلمسة واحدة مثل أي تطبيق.",
    cardAdd: "أضف",
    cardHow: "أرني كيف",
    hideCard: "إخفاء",
  },
};

/** A bottom sheet with the install guide for this phone. */
export function InstallSheet({ source, onClose }: { source: InstallSource; onClose: () => void }) {
  const { language, isRtl } = useLanguage();
  const t = COPY[language];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-sheet-title"
        dir={isRtl ? "rtl" : "ltr"}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[92svh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-[#f5faf5] px-5 pb-7 pt-3 shadow-2xl sm:rounded-[28px] animate-fade-up"
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-gray-300 sm:hidden" />
        <div className="mb-5 flex items-center gap-3">
          <OwlWaving className="h-16 w-16 shrink-0" />
          <div>
            <h2 id="install-sheet-title" className="font-fredoka text-xl font-bold leading-tight text-gray-900">
              {t.title[source]}
            </h2>
            <p className="mt-1 text-sm leading-snug text-gray-600">{t.subtitle}</p>
          </div>
        </div>
        <AddToPhone source={source} onInstalled={() => window.setTimeout(onClose, 2200)} />
        <button type="button" onClick={onClose} className="mt-4 w-full py-2 text-sm font-semibold text-gray-500">
          {t.notNow}
        </button>
      </div>
    </div>
  );
}

/**
 * The dashboard's install card, plus the sheet that opens on its own once
 * after sign-up and once after the first completed lesson.
 */
export function DashboardInstallNudge() {
  const { language, isRtl } = useLanguage();
  const t = COPY[language];
  const platform = useInstallPlatform();
  // Mounted after the dashboard's data loads, so reading storage here can't upset hydration.
  const [sheet, setSheet] = useState<InstallSource | null>(() => pendingInstallNudge());
  const [cardHidden, setCardHidden] = useState(() => isInstallCardHidden());

  useEffect(() => {
    if (sheet === "signup" || sheet === "lesson") markInstallNudgeShown(sheet);
  }, [sheet]);

  if (!platform || platform === "installed") return null;
  // Computers don't get the automatic sheet; the card is enough there.
  const autoSheetBlocked = platform === "desktop" && (sheet === "signup" || sheet === "lesson");

  const add = async () => {
    if (platform === "one-tap") {
      trackAnalyticsEvent("app_install_click", { source: "dashboard", platform });
      const outcome = await promptInstall();
      if (outcome !== "unavailable") {
        trackAnalyticsEvent("app_install_result", { source: "dashboard", platform, outcome });
        return;
      }
    }
    setSheet("dashboard");
  };

  return (
    <>
      {!cardHidden && (
        <div className="mb-8 flex flex-wrap items-center gap-4 rounded-3xl bg-[#ecf7ef] p-4 ring-1 ring-[#cfe9d6] sm:flex-nowrap sm:p-5" dir={isRtl ? "rtl" : "ltr"}>
          <div className="flex min-w-0 flex-1 items-center gap-4">
            {/* A little phone with the Amal icon on its screen. */}
            <div className="flex h-16 w-10 shrink-0 items-center justify-center rounded-xl border-[3px] border-gray-800 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/icon-192.png" alt="" className="h-6 w-6 rounded-md" />
            </div>
            <div className="min-w-0">
              <p className="font-fredoka text-lg font-bold text-gray-900">{t.cardTitle}</p>
              <p className="text-sm text-gray-600">{t.cardBody}</p>
            </div>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <button
              type="button"
              onClick={add}
              className="flex-1 rounded-2xl bg-[#007229] px-5 py-3 font-fredoka font-bold text-white shadow-[0_3px_0_#005C22] transition-transform active:translate-y-0.5 sm:flex-none"
            >
              {platform === "one-tap" ? t.cardAdd : t.cardHow}
            </button>
            <button
              type="button"
              onClick={() => {
                hideInstallCard();
                setCardHidden(true);
              }}
              className="rounded-2xl px-3 py-3 text-sm font-semibold text-gray-500"
            >
              {t.hideCard}
            </button>
          </div>
        </div>
      )}
      {sheet && !autoSheetBlocked && <InstallSheet source={sheet} onClose={() => setSheet(null)} />}
    </>
  );
}
