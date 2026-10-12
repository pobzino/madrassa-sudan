"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { normalizeArabicDigits } from "@/lib/whatsapp-login";

type VerificationType = "signup" | "recovery";

const translations = {
  ar: {
    signupTitle: "أدخل رمز التأكيد",
    recoveryTitle: "أدخل رمز الاستعادة",
    signupSubtitle: "أرسلنا رمز تأكيد إلى بريدك الإلكتروني.",
    recoverySubtitle: "أرسلنا رمز استعادة إلى بريدك الإلكتروني.",
    codeLabel: "رمز التأكيد",
    verify: "تأكيد الرمز",
    verifying: "جارٍ التأكيد...",
    resend: "إرسال رمز جديد",
    resending: "جارٍ الإرسال...",
    resent: "تم إرسال رمز جديد. تحقق من بريدك والرسائل غير المرغوب فيها.",
    invalidCode: "أدخل رمز التأكيد كاملاً.",
    missingEmail: "لم نجد البريد الإلكتروني. ابدأ من جديد.",
    backToLogin: "العودة لتسجيل الدخول",
  },
  en: {
    signupTitle: "Enter your confirmation code",
    recoveryTitle: "Enter your recovery code",
    signupSubtitle: "We sent a confirmation code to your email address.",
    recoverySubtitle: "We sent a recovery code to your email address.",
    codeLabel: "Confirmation code",
    verify: "Confirm code",
    verifying: "Confirming...",
    resend: "Send a new code",
    resending: "Sending...",
    resent: "A new code was sent. Check your inbox and spam folder.",
    invalidCode: "Enter the full confirmation code.",
    missingEmail: "We could not find your email address. Please start again.",
    backToLogin: "Back to login",
  },
} as const;

function verificationType(value: string | null): VerificationType {
  return value === "recovery" ? "recovery" : "signup";
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { language, isRtl } = useLanguage();
  const t = translations[language];
  const email = searchParams.get("email")?.trim() ?? "";
  const type = verificationType(searchParams.get("type"));
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  const normalizedCode = normalizeArabicDigits(code).replace(/\D/g, "");

  const handleVerify = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (!email) {
      setError(t.missingEmail);
      return;
    }
    if (normalizedCode.length < 6 || normalizedCode.length > 10) {
      setError(t.invalidCode);
      return;
    }

    setVerifying(true);
    const { error: verificationError } = await supabase.auth.verifyOtp({
      email,
      token: normalizedCode,
      type,
    });
    setVerifying(false);

    if (verificationError) {
      setError(verificationError.message);
      return;
    }

    if (type === "recovery") {
      router.replace("/auth/reset-password");
      return;
    }

    await fetch("/api/auth/complete-email-verification", { method: "POST" }).catch(() => undefined);
    router.replace("/dashboard");
    router.refresh();
  };

  const handleResend = async () => {
    setError(null);
    setMessage(null);
    if (!email) {
      setError(t.missingEmail);
      return;
    }

    setResending(true);
    const { error: resendError } = type === "recovery"
      ? await supabase.auth.resetPasswordForEmail(email)
      : await supabase.auth.resend({ type: "signup", email });
    setResending(false);

    if (resendError) setError(resendError.message);
    else setMessage(t.resent);
  };

  return (
    <div dir={isRtl ? "rtl" : "ltr"} className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gray-50">
      <div className="pointer-events-none absolute inset-0 grid-pattern opacity-60" />
      <div className="relative z-10 mx-4 w-full max-w-md rounded-3xl border border-gray-100 bg-white p-8 shadow-xl sm:p-12">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-2xl font-bold text-gray-900">
            {type === "recovery" ? t.recoveryTitle : t.signupTitle}
          </h1>
          <p className="text-gray-500">{type === "recovery" ? t.recoverySubtitle : t.signupSubtitle}</p>
          {email && <p dir="ltr" className="mt-3 break-all text-sm font-medium text-gray-700">{email}</p>}
        </div>

        <form className="space-y-5" onSubmit={handleVerify}>
          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          {message && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}

          <div>
            <label htmlFor="code" className="mb-1.5 block text-sm font-semibold text-gray-700">{t.codeLabel}</label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={10}
              required
              value={code}
              onChange={(event) => setCode(normalizeArabicDigits(event.target.value).replace(/\D/g, "").slice(0, 10))}
              className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center text-xl font-semibold text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              dir="ltr"
            />
          </div>

          <button type="submit" disabled={verifying} className="flex w-full items-center justify-center rounded-xl bg-[var(--primary)] px-4 py-3.5 font-semibold text-white shadow-lg shadow-green-900/20 transition-all hover:bg-[var(--primary-light)] disabled:cursor-not-allowed disabled:opacity-50">
            {verifying ? t.verifying : t.verify}
          </button>
        </form>

        <div className="mt-5 space-y-3 text-center">
          <button type="button" onClick={handleResend} disabled={resending} className="text-sm font-semibold text-[var(--primary)] hover:underline disabled:cursor-not-allowed disabled:opacity-50">
            {resending ? t.resending : t.resend}
          </button>
          <Link href="/auth/login" className="block text-sm font-medium text-gray-500 hover:text-[var(--primary)]">{t.backToLogin}</Link>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
