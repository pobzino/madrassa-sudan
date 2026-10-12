"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { loginWhatsappNumberToEmail } from "@/lib/whatsapp-login";
import { getAuthCallbackUrl } from "@/lib/site-url";
import CountryCodeSelect from "@/components/CountryCodeSelect";
import { PARENT_CALLING_CODE_OPTIONS } from "@/lib/calling-codes";

const translations = {
  ar: {
    welcomeBack: "مرحباً بعودتك",
    signInSubtitle: "سجّل الدخول لمتابعة رحلة التعلم",
    emailLabel: "البريد الإلكتروني",
    whatsappLabel: "رقم واتساب",
    countryRegionLabel: "الدولة أو المنطقة",
    localWhatsappPlaceholder: "رقم الهاتف بدون رمز الدولة",
    signInWithEmail: "البريد الإلكتروني",
    signInWithWhatsapp: "واتساب",
    parentLoginHint: "اختر نفس الدولة التي استخدمتها عند التسجيل. يمكنك إدخال رقمك المحلي أو الرقم كاملاً.",
    passwordLabel: "كلمة المرور",
    signIn: "تسجيل الدخول",
    signingIn: "جاري تسجيل الدخول...",
    resendConfirmation: "إعادة إرسال رسالة التأكيد",
    sendingConfirmation: "جاري الإرسال...",
    confirmationSent: "تم إرسال رسالة التأكيد. تحقق من البريد والرسائل غير المرغوب فيها.",
    enterEmailFirst: "أدخل بريدك الإلكتروني أولاً.",
    emailNotConfirmed: "بريدك غير مؤكد بعد.",
    invalidCredentials: "تعذر تسجيل الدخول. تأكد من رقم واتسابك وكلمة المرور، أو استخدم البريد الإلكتروني الذي سجلت به.",
    loginUnavailable: "تعذر تسجيل الدخول الآن. حاول مرة أخرى بعد قليل.",
    forgotPassword: "نسيت كلمة المرور؟",
    noAccount: "ليس لديك حساب؟",
    createAccount: "إنشاء حساب",
  },
  en: {
    welcomeBack: "Welcome Back",
    signInSubtitle: "Sign in to continue your learning journey",
    emailLabel: "Email address",
    whatsappLabel: "WhatsApp number",
    countryRegionLabel: "Country / region",
    localWhatsappPlaceholder: "Phone number without country code",
    signInWithEmail: "Email",
    signInWithWhatsapp: "WhatsApp",
    parentLoginHint: "Choose the same country you used at signup. You can enter either your local or full international number.",
    passwordLabel: "Password",
    signIn: "Sign In",
    signingIn: "Signing in...",
    resendConfirmation: "Resend confirmation email",
    sendingConfirmation: "Sending...",
    confirmationSent: "Confirmation email sent. Check your inbox and spam folder.",
    enterEmailFirst: "Enter your email first.",
    emailNotConfirmed: "Your email is not confirmed yet.",
    invalidCredentials: "We could not sign you in. Check your WhatsApp number and password, or use the email you signed up with.",
    loginUnavailable: "We could not sign you in right now. Please try again shortly.",
    forgotPassword: "Forgot password?",
    noAccount: "Don't have an account?",
    createAccount: "Create Account",
  },
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [loginMethod, setLoginMethod] = useState<"email" | "whatsapp">("email");
  const [callingCode, setCallingCode] = useState("+249");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [requiresEmailConfirmation, setRequiresEmailConfirmation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();
  const { language, isRtl } = useLanguage();
  const t = translations[language];
  const getRedirectUrl = () => (
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback`
      : getAuthCallbackUrl()
  );

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResendMessage(null);
    setRequiresEmailConfirmation(false);

    const identifier = loginMethod === "whatsapp"
      ? loginWhatsappNumberToEmail(whatsapp, callingCode)
      : email.trim();

    const { error } = await supabase.auth.signInWithPassword({
      email: identifier,
      password,
    });

    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes("email not confirmed")) {
        setError(t.emailNotConfirmed);
        setRequiresEmailConfirmation(true);
      } else if (message.includes("invalid login credentials")) {
        setError(t.invalidCredentials);
      } else {
        setError(t.loginUnavailable);
      }
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  };

  const handleResendConfirmation = async () => {
    setError(null);
    setResendMessage(null);
    setRequiresEmailConfirmation(false);

    if (!email.trim()) {
      setError(t.enterEmailFirst);
      return;
    }

    setResendLoading(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: getRedirectUrl() },
    });

    if (error) {
      setError(t.loginUnavailable);
    } else {
      setResendMessage(t.confirmationSent);
    }

    setResendLoading(false);
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
          {resendMessage && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-sm">
              {resendMessage}
            </div>
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-2 rounded-lg border border-gray-200 bg-gray-50 p-1" role="group" aria-label={language === "ar" ? "طريقة تسجيل الدخول" : "Sign-in method"}>
              {([
                ["email", t.signInWithEmail],
                ["whatsapp", t.signInWithWhatsapp],
              ] as const).map(([method, label]) => (
                <button
                  key={method}
                  type="button"
                  aria-pressed={loginMethod === method}
                  onClick={() => {
                    setLoginMethod(method);
                    setError(null);
                    setRequiresEmailConfirmation(false);
                  }}
                  className={`min-h-10 rounded-md px-3 text-sm font-semibold transition-colors ${loginMethod === method ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {loginMethod === "email" ? (
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-1.5">
                  {t.emailLabel}
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
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
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-2">
                  <CountryCodeSelect
                    value={callingCode}
                    onChange={setCallingCode}
                    options={PARENT_CALLING_CODE_OPTIONS}
                    language={language}
                    label={t.countryRegionLabel}
                  />
                  <div>
                    <label htmlFor="whatsapp" className="mb-1.5 block text-xs font-medium text-gray-500">
                      {t.whatsappLabel}
                    </label>
                    <input
                      id="whatsapp"
                      name="whatsapp"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      required
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      className="block min-h-12 w-full rounded-lg border border-gray-300 bg-white px-3 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                      placeholder={t.localWhatsappPlaceholder}
                      dir="ltr"
                      style={{ textAlign: "left" }}
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500">{t.parentLoginHint}</p>
              </div>
            )}

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

          <div className="flex justify-end">
            <Link href="/auth/forgot-password" className="text-sm text-gray-500 hover:text-[var(--primary)] transition-colors">
              {t.forgotPassword}
            </Link>
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

          {requiresEmailConfirmation && (
            <div className="space-y-2">
              <p className="text-sm text-amber-700">{t.emailNotConfirmed}</p>
              <button
                type="button"
                onClick={handleResendConfirmation}
                disabled={resendLoading}
                className="w-full py-3 px-4 border border-[var(--primary)] text-[var(--primary)] font-semibold rounded-xl hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {resendLoading ? t.sendingConfirmation : t.resendConfirmation}
              </button>
            </div>
          )}

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
