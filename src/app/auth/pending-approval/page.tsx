"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { clearAuthCache } from "@/lib/supabase/auth-cache";

const translations = {
  ar: {
    title: "حسابك قيد المراجعة",
    subtitle: "شكراً لتسجيلك! يحتاج المشرف للموافقة على حسابك قبل أن تتمكن من الوصول إلى المنصة.",
    waitMessage: "ستتلقى إشعاراً عند الموافقة على حسابك. يمكنك التحقق مرة أخرى لاحقاً.",
    checkAgain: "تحقق مرة أخرى",
    checking: "جاري التحقق...",
    logout: "تسجيل الخروج",
    approved: "تمت الموافقة! جاري التحويل...",
  },
  en: {
    title: "Your Account is Pending Approval",
    subtitle: "Thanks for signing up! An administrator needs to approve your account before you can access the platform.",
    waitMessage: "You'll be notified when your account is approved. You can check again later.",
    checkAgain: "Check Again",
    checking: "Checking...",
    logout: "Log Out",
    approved: "Approved! Redirecting...",
  },
};

export default function PendingApprovalPage() {
  const [checking, setChecking] = useState(false);
  const [approved, setApproved] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();
  const t = translations[language];

  const checkApproval = async () => {
    setChecking(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("is_approved")
        .eq("id", user.id)
        .single();

      if (profile?.is_approved) {
        setApproved(true);
        clearAuthCache();
        setTimeout(() => router.push("/dashboard"), 1000);
      }
    } finally {
      setChecking(false);
    }
  };

  // Check on mount
  useEffect(() => {
    void checkApproval();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    clearAuthCache();
    router.push("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 relative overflow-hidden">
      <div className="absolute inset-0 grid-pattern opacity-60 pointer-events-none" />

      <div className="max-w-md w-full mx-4 bg-white rounded-3xl shadow-xl border border-gray-100 p-8 sm:p-12 relative z-10 text-center">
        {/* Clock icon */}
        <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        {approved ? (
          <>
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-green-700 mb-2">{t.approved}</h2>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">{t.title}</h2>
            <p className="text-gray-600 mb-4 leading-relaxed">{t.subtitle}</p>
            <p className="text-sm text-gray-400 mb-8">{t.waitMessage}</p>

            <div className="space-y-3">
              <button
                onClick={checkApproval}
                disabled={checking}
                className="w-full py-3 px-4 bg-[var(--primary)] hover:bg-[var(--primary-light)] text-white font-semibold rounded-xl shadow-lg shadow-green-900/20 disabled:opacity-50 transition-all flex justify-center items-center gap-2"
              >
                {checking ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {t.checking}
                  </>
                ) : (
                  t.checkAgain
                )}
              </button>

              <button
                onClick={handleLogout}
                className="w-full py-3 px-4 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
              >
                {t.logout}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
