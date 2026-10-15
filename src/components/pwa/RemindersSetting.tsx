"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { disableReminders, enableReminders, reminderState, remindersSubscribed } from "@/lib/push-client";
import { BlockedRemindersHelp } from "./RemindersPrompt";

type Status = "loading" | "on" | "off" | "busy" | "blocked" | "needs-install" | "unsupported" | "error";

const COPY = {
  en: {
    title: "Lesson reminders",
    on: "On for this phone. You'll get a reminder to keep your streak going, and your weekly summary.",
    off: "Get a short reminder when it's time to learn, and your weekly summary.",
    turnOn: "Turn on",
    turnOff: "Turn off",
    working: "Just a moment…",
    needsInstall: "On iPhone, add Amal to your home screen first, then open it from there to turn on reminders.",
    showMe: "Show me how",
    unsupported: "This browser can't show reminders. Use Chrome on Android, or add Amal to your iPhone's home screen.",
    error: "Something went wrong. Please try again in a minute.",
  },
  ar: {
    title: "تذكيرات الدروس",
    on: "مفعّلة على هذا الهاتف. سيصلك تذكير للحفاظ على سلسلتك، مع ملخصك الأسبوعي.",
    off: "احصل على تذكير قصير عندما يحين وقت التعلّم، مع ملخصك الأسبوعي.",
    turnOn: "فعّل",
    turnOff: "إيقاف",
    working: "لحظة من فضلك…",
    needsInstall: "على iPhone، أضف آمال إلى الشاشة الرئيسية أولاً، ثم افتحه من هناك لتفعيل التذكيرات.",
    showMe: "أرني كيف",
    unsupported: "هذا المتصفح لا يدعم التذكيرات. استخدم Chrome على أندرويد، أو أضف آمال إلى الشاشة الرئيسية في iPhone.",
    error: "حدث خطأ ما. حاول مرة أخرى بعد دقيقة.",
  },
};

/** The Settings page's reminders section: turn reminders on or off for this phone. */
export function RemindersSetting() {
  const { language, isRtl } = useLanguage();
  const t = COPY[language];
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    const state = reminderState();
    void remindersSubscribed().then((subscribed) => {
      if (state === "denied") setStatus("blocked");
      else if (state === "needs-install" || state === "unsupported") setStatus(state);
      else setStatus(subscribed ? "on" : "off");
    });
  }, []);

  const toggle = async () => {
    const turningOn = status !== "on";
    setStatus("busy");
    if (turningOn) {
      const outcome = await enableReminders(language);
      trackAnalyticsEvent("reminders_result", { source: "settings", outcome });
      setStatus(outcome === "on" ? "on" : outcome === "denied" ? "blocked" : outcome === "error" ? "error" : "off");
    } else {
      setStatus((await disableReminders()) ? "off" : "error");
    }
  };

  const body =
    status === "on" ? t.on : status === "needs-install" ? t.needsInstall : status === "unsupported" ? t.unsupported : status === "error" ? t.error : t.off;

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm" dir={isRtl ? "rtl" : "ltr"}>
      <div className="border-b border-gray-100 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-500">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
              <path d="M12 2.5a6 6 0 0 0-6 6v3.6l-1.6 3.2A1 1 0 0 0 5.3 17h13.4a1 1 0 0 0 .9-1.7L18 12.1V8.5a6 6 0 0 0-6-6Z" />
              <path d="M9.5 18.5a2.5 2.5 0 0 0 5 0Z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">{t.title}</h2>
        </div>
      </div>
      <div className="space-y-4 p-6">
        {status === "blocked" ? (
          <BlockedRemindersHelp />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="min-w-0 flex-1 text-sm leading-relaxed text-gray-600">{status === "loading" ? "" : body}</p>
            {status === "needs-install" ? (
              <Link href={`/app?lang=${language}`} className="rounded-xl bg-[#007229] px-5 py-2.5 font-semibold text-white">
                {t.showMe}
              </Link>
            ) : status !== "unsupported" && status !== "loading" ? (
              <button
                type="button"
                onClick={toggle}
                disabled={status === "busy"}
                className={`rounded-xl px-5 py-2.5 font-semibold transition-colors disabled:opacity-60 ${
                  status === "on" ? "border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100" : "bg-[#007229] text-white hover:bg-[#005C22]"
                }`}
              >
                {status === "busy" ? t.working : status === "on" ? t.turnOff : t.turnOn}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
