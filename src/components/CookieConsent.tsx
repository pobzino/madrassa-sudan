"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";

const translations = {
  ar: {
    message: "نستخدم ملفات تعريف الارتباط الأساسية لتشغيل الموقع. لا نستخدم أي تتبع إعلاني.",
    accept: "قبول",
    decline: "رفض",
    privacy: "سياسة الخصوصية",
  },
  en: {
    message: "We use essential cookies to operate this site. We do not use any advertising trackers.",
    accept: "Accept",
    decline: "Decline",
    privacy: "Privacy Policy",
  },
};

const CONSENT_KEY = "cookie-consent";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const { language } = useLanguage();
  const t = translations[language];

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (!stored) {
      setVisible(true);
    }
  }, []);

  const handleChoice = (choice: "accepted" | "declined") => {
    localStorage.setItem(CONSENT_KEY, choice);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 p-3 sm:p-4 animate-slide-up">
      <div className="max-w-2xl mx-auto bg-white border border-gray-200 rounded-2xl shadow-xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
        <p className="text-sm text-gray-700 flex-1">
          {t.message}{" "}
          <Link href="/privacy" className="text-emerald-700 underline hover:text-emerald-800">
            {t.privacy}
          </Link>
        </p>
        <div className="flex gap-2 flex-shrink-0 w-full sm:w-auto">
          <button
            onClick={() => handleChoice("declined")}
            className="flex-1 sm:flex-none px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
          >
            {t.decline}
          </button>
          <button
            onClick={() => handleChoice("accepted")}
            className="flex-1 sm:flex-none px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors"
          >
            {t.accept}
          </button>
        </div>
      </div>
    </div>
  );
}
