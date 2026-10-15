"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { OwlWaving } from "@/components/illustrations";
import { useLanguage } from "@/contexts/LanguageContext";
import { trackAnalyticsEvent } from "@/lib/analytics";
import {
  hideInstallCard,
  isInstallCardHidden,
  markInstallNudgeShown,
  pendingInstallNudge,
  promptInstall,
  type InstallNudgeReason,
  type InstallPlatform,
} from "@/lib/pwa-install";
import {
  enableReminders,
  hideRemindersCard,
  isRemindersCardHidden,
  markRemindersAsked,
  refreshReminders,
  remindersAskCount,
  reminderState,
  shouldAskForReminders,
  type ReminderState,
} from "@/lib/push-client";
import { AddToPhone, useInstallPlatform, type InstallSource } from "./AddToPhone";
import { RemindersPrompt, type RemindersSource } from "./RemindersPrompt";

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
    remindersTitle: "Turn on lesson reminders",
    remindersBody: "A gentle nudge to keep your streak going, plus your weekly summary.",
    remindersButton: "Turn on",
    remindersBusy: "Turning on…",
    remindersOn: "Reminders are on ✓",
    remindersOnBody: "You'll get a test notification in a moment.",
    remindersError: "Couldn't turn reminders on just now. Please try again later.",
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
    remindersTitle: "فعّل تذكيرات الدروس",
    remindersBody: "تذكير لطيف للحفاظ على سلسلتك، مع ملخصك الأسبوعي.",
    remindersButton: "فعّل",
    remindersBusy: "جارٍ التفعيل…",
    remindersOn: "تم تفعيل التذكيرات ✓",
    remindersOnBody: "سيصلك إشعار تجريبي بعد لحظات.",
    remindersError: "تعذّر تفعيل التذكيرات الآن. حاول مرة أخرى لاحقاً.",
  },
};

/** A bottom sheet with the install guide for this phone. */
export function InstallSheet({
  source,
  onClose,
  onInstalled,
}: {
  source: InstallSource;
  onClose: () => void;
  /** Runs shortly after a one-tap install succeeds, instead of just closing. */
  onInstalled?: () => void;
}) {
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
        <AddToPhone source={source} onInstalled={() => window.setTimeout(onInstalled ?? onClose, 1500)} />
        <button type="button" onClick={onClose} className="mt-4 w-full py-2 text-sm font-semibold text-gray-500">
          {t.notNow}
        </button>
      </div>
    </div>
  );
}

type CardProps = {
  icon: ReactNode;
  title: string;
  body: string;
  action?: { label: string; onClick: () => void; disabled?: boolean };
  onHide?: () => void;
};

function NudgeCard({ icon, title, body, action, onHide }: CardProps) {
  const { language, isRtl } = useLanguage();
  return (
    <div className="mb-8 flex flex-wrap items-center gap-4 rounded-3xl bg-[#ecf7ef] p-4 ring-1 ring-[#cfe9d6] sm:flex-nowrap sm:p-5" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex min-w-0 flex-1 items-center gap-4">
        {icon}
        <div className="min-w-0">
          <p className="font-fredoka text-lg font-bold text-gray-900">{title}</p>
          <p className="text-sm text-gray-600">{body}</p>
        </div>
      </div>
      {(action || onHide) && (
        <div className="flex w-full items-center gap-2 sm:w-auto">
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              disabled={action.disabled}
              className="flex-1 rounded-2xl bg-[#007229] px-5 py-3 font-fredoka font-bold text-white shadow-[0_3px_0_#005C22] transition-transform active:translate-y-0.5 disabled:opacity-60 sm:flex-none"
            >
              {action.label}
            </button>
          )}
          {onHide && (
            <button type="button" onClick={onHide} className="rounded-2xl px-3 py-3 text-sm font-semibold text-gray-500">
              {COPY[language].hideCard}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** A little phone with the Amal icon on its screen. */
const PhoneIcon = () => (
  <div className="flex h-16 w-10 shrink-0 items-center justify-center rounded-xl border-[3px] border-gray-800 bg-white">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/icons/icon-192.png" alt="" className="h-6 w-6 rounded-md" />
  </div>
);

const BellIcon = () => (
  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-[#F59E0B] shadow-sm">
    <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor" aria-hidden>
      <path d="M12 2.5a6 6 0 0 0-6 6v3.6l-1.6 3.2A1 1 0 0 0 5.3 17h13.4a1 1 0 0 0 .9-1.7L18 12.1V8.5a6 6 0 0 0-6-6Z" />
      <path d="M9.5 18.5a2.5 2.5 0 0 0 5 0Z" />
    </svg>
  </div>
);

/** Whether this account and phone should be asked to turn reminders on. */
function remindersAskable(allowReminders: boolean) {
  return allowReminders && reminderState() === "default";
}

/**
 * The dashboard's cards: "Add Amal to your phone" until it's installed (or
 * hidden), then "Turn on lesson reminders" for parents until they're on.
 * Hiding a card only snoozes it for a few days.
 */
export function DashboardInstallNudge({ allowReminders = false }: { allowReminders?: boolean }) {
  const { language } = useLanguage();
  const t = COPY[language];
  const platform = useInstallPlatform();
  // Mounted after the dashboard's data loads, so reading storage here can't upset hydration.
  const [sheet, setSheet] = useState<InstallSource | null>(null);
  const [prompt, setPrompt] = useState<RemindersSource | null>(null);
  const [cardHidden, setCardHidden] = useState(() => isInstallCardHidden());
  const [reminders, setReminders] = useState<ReminderState | "busy" | "on" | "error">(() => reminderState());
  const [remindersHidden, setRemindersHidden] = useState(() => isRemindersCardHidden());

  useEffect(() => {
    if (reminders === "granted") void refreshReminders();
  }, [reminders]);

  if (!platform) return null;
  const installed = platform === "installed";
  const showInstallCard = !installed && !cardHidden;
  const showReminders =
    allowReminders && !showInstallCard && (reminders === "on" || reminders === "error" || reminders === "busy" || (reminders === "default" && !remindersHidden));

  const add = async () => {
    if (platform === "one-tap") {
      trackAnalyticsEvent("app_install_click", { source: "dashboard", platform });
      const outcome = await promptInstall();
      if (outcome !== "unavailable") {
        trackAnalyticsEvent("app_install_result", { source: "dashboard", platform, outcome });
        if (outcome === "accepted" && remindersAskable(allowReminders)) setPrompt("after_install");
        return;
      }
    }
    setSheet("dashboard");
  };

  const turnOnReminders = async () => {
    setReminders("busy");
    const outcome = await enableReminders(language);
    trackAnalyticsEvent("reminders_result", { source: "dashboard", outcome, platform });
    if (outcome === "on") setReminders("on");
    else if (outcome === "error") setReminders("error");
    else {
      hideRemindersCard();
      setRemindersHidden(true);
      setReminders(outcome === "denied" ? "denied" : "default");
    }
  };

  return (
    <>
      {showInstallCard && (
        <NudgeCard
          icon={<PhoneIcon />}
          title={t.cardTitle}
          body={t.cardBody}
          action={{ label: platform === "one-tap" ? t.cardAdd : t.cardHow, onClick: add }}
          onHide={() => {
            hideInstallCard(3);
            setCardHidden(true);
          }}
        />
      )}
      {showReminders && (
        <NudgeCard
          icon={<BellIcon />}
          title={reminders === "on" ? t.remindersOn : t.remindersTitle}
          body={reminders === "on" ? t.remindersOnBody : reminders === "error" ? t.remindersError : t.remindersBody}
          action={reminders === "on" ? undefined : { label: reminders === "busy" ? t.remindersBusy : t.remindersButton, onClick: turnOnReminders, disabled: reminders === "busy" }}
          onHide={
            reminders === "on"
              ? undefined
              : () => {
                  hideRemindersCard();
                  setRemindersHidden(true);
                  setReminders("default");
                }
          }
        />
      )}
      {sheet && !installed && (
        <InstallSheet
          source={sheet}
          onClose={() => setSheet(null)}
          onInstalled={() => {
            setSheet(null);
            if (remindersAskable(allowReminders)) setPrompt("after_install");
          }}
        />
      )}
      {prompt && (
        <RemindersPrompt
          source={prompt}
          onClose={() => {
            setPrompt(null);
            setReminders(reminderState());
          }}
        />
      )}
    </>
  );
}

// Pages where a sheet may open on its own. Never during a lesson or practice.
const AUTO_SHEET_PAGES = new Set(["/dashboard", "/lessons", "/progress", "/downloads"]);

type AutoSheet = { kind: "install"; source: InstallSource } | { kind: "reminders"; source: RemindersSource };

function chooseAutoSheet(platform: InstallPlatform, allowReminders: boolean): AutoSheet | null {
  const pending = pendingInstallNudge();
  // First: put Amal on the phone, once after sign-up and once after the first lesson.
  if (pending && platform !== "installed" && platform !== "desktop") return { kind: "install", source: pending };
  // Then: reminders, on any phone that can have them, every few days until they're on.
  if (!remindersAskable(allowReminders) || !shouldAskForReminders()) return null;
  return { kind: "reminders", source: pending === "lesson" ? "lesson" : remindersAskCount() === 0 ? "first_open" : "repeat" };
}

/**
 * Opens the install sheet or the reminders prompt on its own at good moments:
 * after sign-up, after the first lesson, on first opening the installed app,
 * and every few days (up to a limit) until reminders are on. At most one per
 * visit, and only on calm pages. Lives in the app shell so it works anywhere.
 */
export function AutoNudges({ allowReminders, pathname }: { allowReminders: boolean; pathname: string }) {
  const platform = useInstallPlatform();
  const [sheet, setSheet] = useState<AutoSheet | null>(null);
  const shownThisVisit = useRef(false);

  useEffect(() => {
    if (!platform || shownThisVisit.current || !AUTO_SHEET_PAGES.has(pathname)) return;
    // A short pause so the page settles before anything slides up.
    const timer = window.setTimeout(() => {
      const next = chooseAutoSheet(platform, allowReminders);
      if (!next) return;
      shownThisVisit.current = true;
      if (next.kind === "install") markInstallNudgeShown(next.source as InstallNudgeReason);
      else {
        markRemindersAsked();
        if (next.source === "lesson") markInstallNudgeShown("lesson");
      }
      setSheet(next);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [platform, pathname, allowReminders]);

  if (!sheet) return null;
  if (sheet.kind === "install") {
    return (
      <InstallSheet
        source={sheet.source}
        onClose={() => setSheet(null)}
        onInstalled={() => setSheet(remindersAskable(allowReminders) ? { kind: "reminders", source: "after_install" } : null)}
      />
    );
  }
  return <RemindersPrompt source={sheet.source} onClose={() => setSheet(null)} />;
}
