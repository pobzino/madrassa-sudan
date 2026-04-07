"use client";

import { useLanguage } from "@/contexts/LanguageContext";

export default function DownloadsPage() {
  const { language } = useLanguage();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">
        {language === "ar" ? "التحميلات" : "Downloads"}
      </h2>
      <p className="text-gray-500 max-w-sm">
        {language === "ar"
          ? "ميزة التحميل للدراسة بدون إنترنت قادمة قريباً"
          : "Offline downloads coming soon"}
      </p>
    </div>
  );
}
