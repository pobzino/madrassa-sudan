"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import Link from "next/link";

const translations = {
  ar: {
    title: "ربط حساب طالب",
    subtitle: "أدخل رمز الدعوة الذي تلقيته من الطالب",
    codeLabel: "رمز الدعوة",
    codePlaceholder: "ABC123",
    submitButton: "ربط الحساب",
    cancelButton: "إلغاء",
    successMessage: "تم الربط بنجاح!",
    errorInvalid: "رمز دعوة غير صالح أو منتهي الصلاحية",
    errorUsed: "تم استخدام رمز الدعوة هذا بالفعل",
    errorExpired: "انتهت صلاحية رمز الدعوة هذا",
    errorSelf: "لا يمكنك الربط بنفسك",
    errorAlreadyLinked: "أنت مرتبط بالفعل بهذا الطالب",
    errorGeneric: "حدث خطأ. يرجى المحاولة مرة أخرى",
    goToDashboard: "الذهاب إلى لوحة التحكم",
    howToGet: "كيف أحصل على رمز؟",
    instructions: "اطلب من الطالب الذهاب إلى لوحة التحكم الخاصة به واختيار 'دعوة ولي أمر/وصي'.",
  },
  en: {
    title: "Link Student Account",
    subtitle: "Enter the invitation code you received from the student",
    codeLabel: "Invitation Code",
    codePlaceholder: "ABC123",
    submitButton: "Link Account",
    cancelButton: "Cancel",
    successMessage: "Successfully linked!",
    errorInvalid: "Invalid or expired invitation code",
    errorUsed: "This invitation code has already been used",
    errorExpired: "This invitation code has expired",
    errorSelf: "You cannot link to yourself",
    errorAlreadyLinked: "You are already linked to this student",
    errorGeneric: "An error occurred. Please try again",
    goToDashboard: "Go to Dashboard",
    howToGet: "How do I get a code?",
    instructions: "Ask the student to go to their dashboard and select 'Invite Parent/Guardian'.",
  },
};

export default function GuardianLinkPage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [linkedStudent, setLinkedStudent] = useState<{ full_name: string } | null>(null);
  const router = useRouter();
  const { language } = useLanguage();
  const t = translations[language];
  const isRtl = language === "ar";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/guardian/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.toUpperCase().trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle specific error messages
        if (data.error.includes("Invalid or expired")) {
          setError(t.errorInvalid);
        } else if (data.error.includes("already been used")) {
          setError(t.errorUsed);
        } else if (data.error.includes("has expired")) {
          setError(t.errorExpired);
        } else if (data.error.includes("cannot link to yourself")) {
          setError(t.errorSelf);
        } else if (data.error.includes("already linked")) {
          setError(t.errorAlreadyLinked);
        } else {
          setError(t.errorGeneric);
        }
        setLoading(false);
        return;
      }

      setSuccess(true);
      setLinkedStudent(data.student);
      setTimeout(() => router.push("/guardian/dashboard"), 2000);
    } catch (err) {
      console.error("Error linking account:", err);
      setError(t.errorGeneric);
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#007229]/5 via-white to-[#D21034]/5 flex items-center justify-center p-4" dir={isRtl ? "rtl" : "ltr"}>
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t.successMessage}</h2>
          {linkedStudent && (
            <p className="text-gray-600 mb-6">
              {language === "ar" ? "مرتبط بـ " : "Linked to "}
              <span className="font-semibold">{linkedStudent.full_name}</span>
            </p>
          )}
          <Link
            href="/guardian/dashboard"
            className="inline-block px-6 py-3 bg-gradient-to-r from-[#007229] to-[#00913D] text-white font-semibold rounded-xl hover:shadow-lg transition-all"
          >
            {t.goToDashboard}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#007229]/5 via-white to-[#D21034]/5 flex items-center justify-center p-4" dir={isRtl ? "rtl" : "ltr"}>
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{t.title}</h1>
          <p className="text-gray-600 mb-8">{t.subtitle}</p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                {t.codeLabel}
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder={t.codePlaceholder}
                maxLength={6}
                className="w-full px-4 py-3 text-center text-2xl font-mono tracking-widest border-2 border-gray-300 rounded-xl focus:outline-none focus:border-[#007229] transition-colors uppercase"
                required
                disabled={loading}
              />
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <Link
                href="/dashboard"
                className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors text-center"
              >
                {t.cancelButton}
              </Link>
              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-[#007229] to-[#00913D] text-white font-semibold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  </span>
                ) : (
                  t.submitButton
                )}
              </button>
            </div>
          </form>

          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-sm font-semibold text-gray-700 mb-2">{t.howToGet}</p>
            <p className="text-sm text-gray-600">{t.instructions}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
