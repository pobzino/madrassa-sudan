"use client";

import { Globe2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

/** English/Arabic switch for the offline pages, which sit outside the dashboard and its top bar. */
export function LanguageToggle({ className = "" }: { className?: string }) {
  const { language, setLanguage } = useLanguage();
  return (
    <button
      type="button"
      onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
      className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700 transition-colors hover:border-emerald-300 hover:text-emerald-800 ${className}`}
    >
      <Globe2 className="h-4 w-4" aria-hidden="true" />
      {language === "ar" ? "English" : "عربي"}
    </button>
  );
}
