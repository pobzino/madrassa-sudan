"use client";

import Link from "next/link";
import { useState } from "react";
import FeedbackModal from "@/components/FeedbackModal";
import { useLanguage } from "@/contexts/LanguageContext";
import { LOG_OUT_BUSY_LABELS, logOutWithUnsentCheck, type LogOutPhase } from "@/lib/auth/logout";

const COPY = {
  en: { title: "Account", teacher: "Teacher dashboard", report: "Report an issue", logout: "Log out" },
  ar: { title: "الحساب", teacher: "لوحة المعلم", report: "الإبلاغ عن مشكلة", logout: "تسجيل الخروج" },
};

/**
 * Log out (and, for staff, the teacher dashboard and issue reports) on the
 * Settings page. The installed app has no menu, so these live here too.
 */
export function AccountActions({ isStaff }: { isStaff: boolean }) {
  const { language, isRtl } = useLanguage();
  const t = COPY[language];
  const [showFeedback, setShowFeedback] = useState(false);
  const [logOutPhase, setLogOutPhase] = useState<LogOutPhase | null>(null);

  // The shared log-out: it sends what's waiting (asking before deleting
  // anything unsent), clears this phone's downloads and session, and ends
  // with a full page load, so the busy state stays until then.
  const handleLogOut = async () => {
    if (logOutPhase) return;
    await logOutWithUnsentCheck({ language, onPhase: setLogOutPhase });
  };

  const row = "flex w-full items-center justify-between rounded-xl px-4 py-3.5 text-[15px] font-medium transition-colors";

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm" dir={isRtl ? "rtl" : "ltr"}>
      <div className="border-b border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900">{t.title}</h2>
      </div>
      <div className="space-y-1 p-3">
        {isStaff && (
          <>
            <Link href="/teacher" className={`${row} text-gray-700 hover:bg-gray-50`}>
              {t.teacher}
              <span aria-hidden>{isRtl ? "←" : "→"}</span>
            </Link>
            <button type="button" onClick={() => setShowFeedback(true)} className={`${row} text-amber-600 hover:bg-amber-50`}>
              {t.report}
            </button>
          </>
        )}
        <button type="button" onClick={() => void handleLogOut()} disabled={logOutPhase !== null} className={`${row} text-red-600 hover:bg-red-50 disabled:opacity-60`}>
          {logOutPhase ? LOG_OUT_BUSY_LABELS[language][logOutPhase] : t.logout}
        </button>
      </div>
      <FeedbackModal open={showFeedback} onClose={() => setShowFeedback(false)} />
    </div>
  );
}
