"use client";

import { ClipboardEvent, FormEvent, KeyboardEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { normalizeArabicDigits } from "@/lib/whatsapp-login";

type VerificationType = "signup" | "recovery";
const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;

const translations = {
  ar: {
    signupTitle: "أدخل رمز التأكيد",
    recoveryTitle: "أدخل رمز الاستعادة",
    signupSubtitle: "أرسلنا رمز تأكيد من 6 أرقام إلى بريدك الإلكتروني.",
    recoverySubtitle: "أرسلنا رمز استعادة من 6 أرقام إلى بريدك الإلكتروني.",
    codeLabel: "رمز التأكيد المكون من 6 أرقام",
    verify: "تأكيد الرمز",
    verifying: "جارٍ التأكيد...",
    resend: "إرسال رمز جديد",
    resending: "جارٍ الإرسال...",
    resendCooldown: "يمكنك طلب رمز جديد خلال {seconds} ثانية.",
    resent: "تم إرسال رمز جديد. تحقق من بريدك والرسائل غير المرغوب فيها.",
    resendHint: "قد يستغرق وصول الرمز بضع دقائق. استخدم أحدث رمز فقط.",
    invalidCode: "أدخل رمز التأكيد المكون من 6 أرقام.",
    codeDigit: "رقم",
    missingEmail: "لم نجد البريد الإلكتروني. ابدأ من جديد.",
    backToLogin: "العودة لتسجيل الدخول",
  },
  en: {
    signupTitle: "Enter your confirmation code",
    recoveryTitle: "Enter your recovery code",
    signupSubtitle: "We sent a 6-digit confirmation code to your email address.",
    recoverySubtitle: "We sent a 6-digit recovery code to your email address.",
    codeLabel: "6-digit confirmation code",
    verify: "Confirm code",
    verifying: "Confirming...",
    resend: "Send a new code",
    resending: "Sending...",
    resendCooldown: "You can request a new code in {seconds}s.",
    resent: "A new code was sent. Check your inbox and spam folder.",
    resendHint: "Delivery can take a few minutes. Use only the newest code.",
    invalidCode: "Enter the 6-digit confirmation code.",
    codeDigit: "Digit",
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
  const [code, setCode] = useState(() => Array.from({ length: OTP_LENGTH }, () => ""));
  const codeInputs = useRef<Array<HTMLInputElement | null>>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const normalizedCode = code.join("");

  useEffect(() => {
    if (resendCooldown === 0) return;
    const timer = window.setTimeout(() => setResendCooldown((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  const focusCodeInput = (index: number) => {
    requestAnimationFrame(() => codeInputs.current[index]?.focus());
  };

  const setCodeFromValue = (startIndex: number, value: string) => {
    const digits = normalizeArabicDigits(value).replace(/\D/g, "").slice(0, OTP_LENGTH - startIndex);
    if (!digits) {
      setCode((current) => current.map((digit, index) => (index === startIndex ? "" : digit)));
      return;
    }

    setCode((current) => {
      const next = [...current];
      digits.split("").forEach((digit, offset) => {
        next[startIndex + offset] = digit;
      });
      return next;
    });
    focusCodeInput(Math.min(startIndex + digits.length, OTP_LENGTH - 1));
  };

  const handleCodeKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !code[index] && index > 0) {
      event.preventDefault();
      setCode((current) => current.map((digit, itemIndex) => (itemIndex === index - 1 ? "" : digit)));
      focusCodeInput(index - 1);
    }
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      focusCodeInput(index - 1);
    }
    if (event.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      event.preventDefault();
      focusCodeInput(index + 1);
    }
  };

  const handleCodePaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    setCodeFromValue(index, event.clipboardData.getData("text"));
  };

  const handleVerify = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (!email) {
      setError(t.missingEmail);
      return;
    }
    if (normalizedCode.length !== OTP_LENGTH) {
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
    if (resendCooldown > 0) return;
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

    if (resendError) {
      setError(resendError.message);
    } else {
      setMessage(t.resent);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    }
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

        <form className="space-y-5" onSubmit={handleVerify} aria-busy={verifying}>
          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          {message && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}

          <fieldset disabled={verifying}>
            <legend className="mb-2 block text-sm font-semibold text-gray-700">{t.codeLabel}</legend>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" dir="ltr">
              {code.map((digit, index) => (
                <input
                  key={index}
                  ref={(element) => { codeInputs.current[index] = element; }}
                  id={index === 0 ? "code" : undefined}
                  type="text"
                  inputMode="numeric"
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  aria-label={`${t.codeDigit} ${index + 1}`}
                  maxLength={index === 0 ? OTP_LENGTH : 1}
                  required
                  value={digit}
                  onChange={(event) => setCodeFromValue(index, event.target.value)}
                  onKeyDown={(event) => handleCodeKeyDown(index, event)}
                  onPaste={(event) => handleCodePaste(index, event)}
                  className="h-12 min-w-0 rounded-lg border border-gray-200 bg-gray-50 p-0 text-center text-lg font-bold tabular-nums text-gray-900 transition-colors focus:border-[var(--primary)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)] disabled:cursor-wait disabled:opacity-60 sm:h-14 sm:text-xl"
                />
              ))}
            </div>
          </fieldset>

          {verifying && (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-[var(--primary)]/20 bg-emerald-50 px-4 py-3 text-sm font-semibold text-[var(--primary)]" aria-live="polite">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              {t.verifying}
            </div>
          )}

          <button type="submit" disabled={verifying || normalizedCode.length !== OTP_LENGTH} className="flex w-full items-center justify-center rounded-xl bg-[var(--primary)] px-4 py-3.5 font-semibold text-white shadow-lg shadow-green-900/20 transition-all hover:bg-[var(--primary-light)] disabled:cursor-not-allowed disabled:opacity-50">
            {verifying ? t.verifying : t.verify}
          </button>
        </form>

        <div className="mt-5 space-y-3 text-center">
          <p className="text-sm text-gray-500">{t.resendHint}</p>
          <button type="button" onClick={handleResend} disabled={resending || resendCooldown > 0} className="text-sm font-semibold text-[var(--primary)] hover:underline disabled:cursor-not-allowed disabled:opacity-50">
            {resending
              ? t.resending
              : resendCooldown > 0
                ? t.resendCooldown.replace("{seconds}", String(resendCooldown))
                : t.resend}
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
