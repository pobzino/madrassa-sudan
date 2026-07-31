"use client";

// Route-level error screen.
//
// Two changes from the original: it reports the error so the team learns about
// it, and it no longer prints the message and full stack trace on screen. The
// people who hit this are children and volunteer tutors — a stack trace tells
// them nothing, can leak internals, and reads as "the app is broken beyond
// repair". Staff get the detail in the error log instead, keyed by digest.

import { useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { reportClientError } from "@/lib/observability/report-client-error";

const COPY = {
  ar: {
    title: "حدث خطأ ما",
    body: "لم نتمكن من عرض هذه الصفحة. تم إبلاغ فريقنا.",
    retry: "حاول مرة أخرى",
    reference: "الرقم المرجعي",
  },
  en: {
    title: "Something went wrong",
    body: "We couldn't show this page. Our team has been told.",
    retry: "Try again",
    reference: "Reference",
  },
} as const;

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { language, isRtl } = useLanguage();
  const t = COPY[language] ?? COPY.en;

  useEffect(() => {
    reportClientError({
      error,
      level: "fatal",
      context: { kind: "route_boundary", digest: error.digest ?? null },
    });
  }, [error]);

  return (
    <div dir={isRtl ? "rtl" : "ltr"} className="flex min-h-[50vh] flex-col items-center justify-center p-8">
      <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
        <div className="mb-2 text-3xl" aria-hidden="true">
          🦉
        </div>
        <h2 className="mb-2 text-lg font-semibold text-amber-900">{t.title}</h2>
        <p className="mb-4 text-sm text-amber-800">{t.body}</p>
        <button
          onClick={reset}
          className="rounded-xl bg-[var(--primary,#007229)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          {t.retry}
        </button>
        {error.digest && (
          <p className="mt-3 text-[11px] text-amber-500">
            {t.reference}: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
