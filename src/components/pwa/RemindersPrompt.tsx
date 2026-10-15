"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { enableReminders, hideRemindersCard } from "@/lib/push-client";

export type RemindersSource = "first_open" | "after_install" | "lesson" | "repeat" | "dashboard" | "settings";

const COPY = {
  en: {
    title: {
      first_open: "Never miss a lesson",
      after_install: "One more step: turn on reminders",
      lesson: "Great work! Want a reminder for the next lesson?",
      repeat: "Turn on lesson reminders",
      dashboard: "Turn on lesson reminders",
      settings: "Turn on lesson reminders",
    },
    body: "We'll send a short reminder when it's time to learn, and your weekly summary. You can turn them off any time in Settings.",
    previewTitle: "🔥 4-day learning streak",
    previewBody: "Do today's lesson to keep it going.",
    now: "now",
    button: "Turn on reminders",
    busy: "Turning on…",
    on: "Reminders are on ✓",
    onBody: "A test notification is on its way.",
    error: "Couldn't turn reminders on just now. Please try again later.",
    pending: "Almost done: we'll finish turning reminders on in a moment.",
    notNow: "Not now",
    close: "Close",
  },
  ar: {
    title: {
      first_open: "لا تفوّت أي درس",
      after_install: "خطوة أخيرة: فعّل التذكيرات",
      lesson: "أحسنت! هل تريد تذكيراً بالدرس التالي؟",
      repeat: "فعّل تذكيرات الدروس",
      dashboard: "فعّل تذكيرات الدروس",
      settings: "فعّل تذكيرات الدروس",
    },
    body: "سنرسل تذكيراً قصيراً عندما يحين وقت التعلّم، مع ملخصك الأسبوعي. يمكنك إيقافها في أي وقت من الإعدادات.",
    previewTitle: "🔥 سلسلة التعلّم: ٤",
    previewBody: "أكملوا درس اليوم لتستمر السلسلة.",
    now: "الآن",
    button: "فعّل التذكيرات",
    busy: "جارٍ التفعيل…",
    on: "تم تفعيل التذكيرات ✓",
    onBody: "إشعار تجريبي في الطريق إليك.",
    error: "تعذّر تفعيل التذكيرات الآن. حاول مرة أخرى لاحقاً.",
    pending: "اقتربنا: سنُكمل تفعيل التذكيرات بعد لحظات.",
    notNow: "ليس الآن",
    close: "إغلاق",
  },
};

/** Steps to unblock notifications after "Don't allow", which only the phone's settings can undo. */
export function BlockedRemindersHelp() {
  const { language } = useLanguage();
  const ios = typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const text = {
    en: ios
      ? "Notifications are turned off for Amal. To turn them on: open your iPhone's Settings, tap Notifications, tap Amal, then turn on Allow Notifications."
      : "Notifications are turned off for Amal. To turn them on: press and hold the Amal icon, tap App info, tap Notifications, then turn them on. In Chrome, you can also tap ⋮, then Settings, Site settings, Notifications.",
    ar: ios
      ? "الإشعارات متوقفة لآمال. لتفعيلها: افتح «الإعدادات» في هاتفك، ثم «الإشعارات»، ثم «آمال»، وفعّل «السماح بالإشعارات»."
      : "الإشعارات متوقفة لآمال. لتفعيلها: اضغط مطولاً على أيقونة آمال، ثم «معلومات التطبيق»، ثم «الإشعارات» وفعّلها. ويمكنك أيضاً من Chrome: ⋮ ثم «الإعدادات» ثم «إعدادات المواقع» ثم «الإشعارات».",
  };
  return <p className="rounded-2xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 ring-1 ring-amber-200">{text[language]}</p>;
}

/**
 * Our own ask before the phone's permission box: a preview of a reminder and
 * one button. The phone's box only appears once they've said yes here.
 */
export function RemindersPrompt({ source, onClose }: { source: RemindersSource; onClose: () => void }) {
  const { language, isRtl } = useLanguage();
  const t = COPY[language];
  const [state, setState] = useState<"ask" | "busy" | "on" | "denied" | "pending" | "error">("ask");

  useEffect(() => {
    trackAnalyticsEvent("reminders_prompt_view", { source });
  }, [source]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const turnOn = async () => {
    setState("busy");
    const outcome = await enableReminders(language);
    trackAnalyticsEvent("reminders_result", { source, outcome });
    if (outcome === "on") {
      setState("on");
      window.setTimeout(onClose, 2500);
    } else if (outcome === "denied") setState("denied");
    else if (outcome === "error" || outcome === "pending") setState(outcome);
    else setState("ask");
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reminders-title"
        dir={isRtl ? "rtl" : "ltr"}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[92svh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-[#f5faf5] px-5 pb-7 pt-3 shadow-2xl sm:rounded-[28px] animate-fade-up"
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-gray-300 sm:hidden" />

        {/* What a reminder looks like on the lock screen. */}
        <div className="mb-5 flex items-start gap-3 rounded-2xl bg-white/90 p-3 shadow-md ring-1 ring-black/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-sm font-bold text-gray-900">{t.previewTitle}</p>
              <span className="shrink-0 text-xs text-gray-400">{t.now}</span>
            </div>
            <p className="text-sm text-gray-600">{t.previewBody}</p>
          </div>
        </div>

        <h2 id="reminders-title" className="font-fredoka text-xl font-bold leading-tight text-gray-900">
          {state === "on" ? t.on : t.title[source]}
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-gray-600">{state === "on" ? t.onBody : t.body}</p>

        <div className="mt-5">
          {state === "denied" ? (
            <BlockedRemindersHelp />
          ) : state !== "on" ? (
            <button
              type="button"
              onClick={turnOn}
              disabled={state === "busy"}
              className="w-full rounded-2xl bg-[#007229] px-6 py-4 font-fredoka text-lg font-bold text-white shadow-[0_4px_0_#005C22] transition-transform active:translate-y-0.5 disabled:opacity-60"
            >
              {state === "busy" ? t.busy : t.button}
            </button>
          ) : null}
          {state === "error" && <p className="mt-3 text-center text-sm text-red-600">{t.error}</p>}
          {state === "pending" && <p className="mt-3 text-center text-sm text-gray-600">{t.pending}</p>}
        </div>

        {state !== "on" && (
          <button
            type="button"
            onClick={() => {
              // "Not now" also quiets the dashboard card for a few days, so it doesn't ask again straight away.
              if (state !== "denied") hideRemindersCard();
              onClose();
            }}
            className="mt-3 w-full py-2 text-sm font-semibold text-gray-500"
          >
            {state === "denied" ? t.close : t.notNow}
          </button>
        )}
      </div>
    </div>
  );
}
