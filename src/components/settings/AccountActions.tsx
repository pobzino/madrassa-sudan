"use client";

import Link from "next/link";
import { useState } from "react";
import FeedbackModal from "@/components/FeedbackModal";
import { useLanguage } from "@/contexts/LanguageContext";
import { countUnsyncedItems, logOut } from "@/lib/auth/logout";
import { getOwner } from "@/lib/offline/identity";

const COPY = {
  en: { title: "Account", teacher: "Teacher dashboard", report: "Report an issue", logout: "Log out", loggingOut: "Logging out…" },
  ar: { title: "الحساب", teacher: "لوحة المعلم", report: "الإبلاغ عن مشكلة", logout: "تسجيل الخروج", loggingOut: "جارٍ تسجيل الخروج…" },
};

const UNSYNCED_WARNING = {
  en: "Some progress saved on this phone hasn't been sent yet. Logging out without internet deletes it. Log out anyway?",
  ar: "بعض التقدّم المحفوظ على هذا الهاتف لم يُرسَل بعد. تسجيل الخروج بدون إنترنت سيحذفه. هل تريد تسجيل الخروج على أي حال؟",
};

/**
 * Asks before a log-out that would lose progress saved offline. Online,
 * logOut() sends the queue first, so there's nothing to ask. Resolves true
 * to go ahead.
 */
export async function confirmLogOutIfUnsynced(language: "ar" | "en"): Promise<boolean> {
  if (navigator.onLine) return true;
  const owner = await getOwner();
  const unsynced = await countUnsyncedItems(owner?.userId);
  return unsynced === 0 || window.confirm(UNSYNCED_WARNING[language]);
}

/**
 * Log out (and, for staff, the teacher dashboard and issue reports) on the
 * Settings page. The installed app has no menu, so these live here too.
 */
export function AccountActions({ isStaff }: { isStaff: boolean }) {
  const { language, isRtl } = useLanguage();
  const t = COPY[language];
  const [showFeedback, setShowFeedback] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // The shared log-out: it also clears this phone's downloads and session,
  // and ends with a full page load, so the busy state stays until then.
  const handleLogOut = async () => {
    if (loggingOut || !(await confirmLogOutIfUnsynced(language))) return;
    setLoggingOut(true);
    await logOut();
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
        <button type="button" onClick={() => void handleLogOut()} disabled={loggingOut} className={`${row} text-red-600 hover:bg-red-50 disabled:opacity-60`}>
          {loggingOut ? t.loggingOut : t.logout}
        </button>
      </div>
      <FeedbackModal open={showFeedback} onClose={() => setShowFeedback(false)} />
    </div>
  );
}
