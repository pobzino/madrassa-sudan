"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { UserRole } from "@/lib/database.types";
import { useLanguage } from "@/contexts/LanguageContext";

const translations = {
  ar: {
    createAccount: "إنشاء حساب",
    joinSubtitle: "انضم إلى مدرسة السودان اليوم",
    fullNameLabel: "الاسم الكامل",
    fullNamePlaceholder: "أحمد محمد",
    emailLabel: "البريد الإلكتروني",
    passwordLabel: "كلمة المرور",
    iAmA: "أنا...",
    student: "طالب",
    teacher: "معلم",
    parent: "ولي أمر",
    createAccountBtn: "إنشاء حساب",
    creatingAccount: "جاري إنشاء الحساب...",
    alreadyHaveAccount: "لديك حساب بالفعل؟",
    signIn: "تسجيل الدخول",
    checkEmail: "تحقق من بريدك الإلكتروني",
    sentConfirmation: "لقد أرسلنا رابط التأكيد إلى",
    backToLogin: "العودة لتسجيل الدخول",
  },
  en: {
    createAccount: "Create Account",
    joinSubtitle: "Join Madrassa Sudan today",
    fullNameLabel: "Full Name",
    fullNamePlaceholder: "Ahmed Mohamed",
    emailLabel: "Email Address",
    passwordLabel: "Password",
    iAmA: "I am a...",
    student: "Student",
    teacher: "Teacher",
    parent: "Parent",
    createAccountBtn: "Create Account",
    creatingAccount: "Creating account...",
    alreadyHaveAccount: "Already have an account?",
    signIn: "Sign In",
    checkEmail: "Check your email",
    sentConfirmation: "We've sent a confirmation link to",
    backToLogin: "Back to Login",
  },
};

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<UserRole>("student");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const { language, isRtl } = useLanguage();
  const t = translations[language];

  const roleOptions = [
    { id: "student" as UserRole, label: t.student, icon: "🎓" },
    { id: "teacher" as UserRole, label: t.teacher, icon: "🍎" },
    { id: "parent" as UserRole, label: t.parent, icon: "👨‍👩‍👧" },
  ];

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role: role,
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 relative overflow-hidden">
        <div className="absolute inset-0 grid-pattern opacity-60 pointer-events-none" />
        <div className="max-w-md w-full mx-4 bg-white rounded-3xl shadow-xl border border-gray-100 p-8 text-center relative z-10 animate-fade-up">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-6">
            ✉️
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t.checkEmail}</h2>
          <p className="text-gray-600 mb-6">
            {t.sentConfirmation} <br />
            <span className="font-semibold text-gray-900" dir="ltr">{email}</span>
          </p>
          <Link
            href="/auth/login"
            className="inline-flex items-center justify-center px-6 py-3 bg-[var(--primary)] text-white font-semibold rounded-xl hover:bg-[var(--primary-light)] transition-colors shadow-lg shadow-green-900/20"
          >
            {t.backToLogin}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 relative overflow-hidden py-12">
      {/* Grid Background */}
      <div className="absolute inset-0 grid-pattern opacity-60 pointer-events-none" />

      <div className="max-w-md w-full mx-4 bg-white rounded-3xl shadow-xl border border-gray-100 p-8 sm:p-12 relative z-10 animate-fade-up">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-[var(--primary)] rounded-xl flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-green-900/10 mx-auto mb-4">
            م
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t.createAccount}</h1>
          <p className="text-gray-500">{t.joinSubtitle}</p>
        </div>

        <form className="space-y-6" onSubmit={handleSignup}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="fullName" className="block text-sm font-semibold text-gray-700 mb-1.5">
                {t.fullNameLabel}
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="block w-full px-4 py-3 bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:bg-white transition-all"
                placeholder={t.fullNamePlaceholder}
              />
            </div>

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
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full px-4 py-3 bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:bg-white transition-all"
                placeholder="••••••••"
                dir="ltr"
                style={{ textAlign: "left" }}
              />
            </div>

            <div>
              <label htmlFor="role" className="block text-sm font-semibold text-gray-700 mb-1.5">
                {t.iAmA}
              </label>
              <div className="grid grid-cols-3 gap-3">
                {roleOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setRole(option.id)}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-sm transition-all ${
                      role === option.id
                        ? "bg-green-50 border-[var(--primary)] text-[var(--primary)] ring-1 ring-[var(--primary)]"
                        : "bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <span className="text-xl mb-1">{option.icon}</span>
                    <span className="font-medium">{option.label}</span>
                  </button>
                ))}
              </div>
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
                <span>{t.creatingAccount}</span>
              </>
            ) : (
              t.createAccountBtn
            )}
          </button>

          <p className="text-center text-sm text-gray-500">
            {t.alreadyHaveAccount}{" "}
            <Link href="/auth/login" className="font-semibold text-[var(--primary)] hover:underline">
              {t.signIn}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
