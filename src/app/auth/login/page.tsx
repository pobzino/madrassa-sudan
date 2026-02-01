"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";

const translations = {
  ar: {
    welcomeBack: "مرحباً بعودتك",
    signInSubtitle: "سجّل الدخول لمتابعة رحلة التعلم",
    emailLabel: "البريد الإلكتروني",
    passwordLabel: "كلمة المرور",
    signIn: "تسجيل الدخول",
    signingIn: "جاري تسجيل الدخول...",
    noAccount: "ليس لديك حساب؟",
    createAccount: "إنشاء حساب",
  },
  en: {
    welcomeBack: "Welcome Back",
    signInSubtitle: "Sign in to continue your learning journey",
    emailLabel: "Email Address",
    passwordLabel: "Password",
    signIn: "Sign In",
    signingIn: "Signing in...",
    noAccount: "Don't have an account?",
    createAccount: "Create Account",
  },
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const { language, isRtl } = useLanguage();
  const t = translations[language];

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 relative overflow-hidden">
      {/* Grid Background */}
      <div className="absolute inset-0 grid-pattern opacity-60 pointer-events-none" />

      <div className="max-w-md w-full mx-4 bg-white rounded-3xl shadow-xl border border-gray-100 p-8 sm:p-12 relative z-10 animate-fade-up">
        <div className="text-center mb-10">
          <div className="w-12 h-12 bg-[var(--primary)] rounded-xl flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-green-900/10 mx-auto mb-4">
            م
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t.welcomeBack}</h1>
          <p className="text-gray-500">{t.signInSubtitle}</p>
        </div>

        <form className="space-y-6" onSubmit={handleLogin}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {error}
            </div>
          )}

          <div className="space-y-4">
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

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-1.5">
                {t.passwordLabel}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full px-4 py-3 bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:bg-white transition-all"
                placeholder="••••••••"
                dir="ltr"
                style={{ textAlign: "left" }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-4 bg-[var(--primary)] hover:bg-[var(--primary-light)] text-white font-semibold rounded-xl shadow-lg shadow-green-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex justify-center items-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <span>{t.signingIn}</span>
              </>
            ) : t.signIn}
          </button>

          <p className="text-center text-sm text-gray-500">
            {t.noAccount}{" "}
            <Link href="/auth/signup" className="font-semibold text-[var(--primary)] hover:underline">
              {t.createAccount}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
