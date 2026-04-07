"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { getAuthCallbackUrl } from "@/lib/site-url";

const translations = {
  ar: {
    title: "استعادة كلمة المرور",
    subtitle: "أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين",
    emailLabel: "البريد الإلكتروني",
    send: "إرسال رابط الاستعادة",
    sending: "جاري الإرسال...",
    sent: "تم الإرسال!",
    sentMessage: "تحقق من بريدك الإلكتروني للحصول على رابط إعادة تعيين كلمة المرور. تحقق أيضاً من مجلد الرسائل غير المرغوب فيها.",
    backToLogin: "العودة لتسجيل الدخول",
  },
  en: {
    title: "Reset Password",
    subtitle: "Enter your email and we'll send you a reset link",
    emailLabel: "Email Address",
    send: "Send Reset Link",
    sending: "Sending...",
    sent: "Email Sent!",
    sentMessage: "Check your email for a password reset link. Also check your spam folder.",
    backToLogin: "Back to Login",
  },
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();
  const { language } = useLanguage();
  const t = translations[language];

  const getRedirectUrl = () => {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/auth/reset-password`;
    }
    return `${getAuthCallbackUrl().replace("/auth/callback", "")}/auth/reset-password`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getRedirectUrl(),
    });

    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 relative overflow-hidden">
      <div className="absolute inset-0 grid-pattern opacity-60 pointer-events-none" />

      <div className="max-w-md w-full mx-4 bg-white rounded-3xl shadow-xl border border-gray-100 p-8 sm:p-12 relative z-10 animate-fade-up">
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t.title}</h1>
          <p className="text-gray-500">{t.subtitle}</p>
        </div>

        {sent ? (
          <div className="space-y-6">
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-4 rounded-xl text-sm text-center">
              <p className="font-semibold mb-1">{t.sent}</p>
              <p>{t.sentMessage}</p>
            </div>
            <Link
              href="/auth/login"
              className="block w-full py-3.5 px-4 bg-[var(--primary)] hover:bg-[var(--primary-light)] text-white font-semibold rounded-xl shadow-lg shadow-green-900/20 transition-all text-center"
            >
              {t.backToLogin}
            </Link>
          </div>
        ) : (
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-1.5">
                {t.emailLabel}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full px-4 py-3 bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:bg-white transition-all"
                placeholder="name@example.com"
                dir="ltr"
                style={{ textAlign: "left" }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 bg-[var(--primary)] hover:bg-[var(--primary-light)] text-white font-semibold rounded-xl shadow-lg shadow-green-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex justify-center items-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>{t.sending}</span>
                </>
              ) : (
                t.send
              )}
            </button>

            <p className="text-center text-sm text-gray-500">
              <Link href="/auth/login" className="font-semibold text-[var(--primary)] hover:underline">
                {t.backToLogin}
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
