"use client";

import { useLanguage, Language } from "@/contexts/LanguageContext";

export function LanguageSelector() {
  const { hasSelectedLanguage, setLanguage, setHasSelectedLanguage } = useLanguage();

  const handleSelectLanguage = (lang: Language) => {
    setLanguage(lang);
    setHasSelectedLanguage(true);
  };

  // Don't render if user has already selected a language
  if (hasSelectedLanguage) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative max-w-md w-full mx-4 bg-white rounded-3xl shadow-2xl overflow-hidden">
        {/* Gradient top accent */}
        <div className="h-2 bg-gradient-to-r from-emerald-500 via-emerald-600 to-amber-500" />

        <div className="p-8 text-center">
          {/* Logo/Icon */}
          <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <span className="text-4xl">📚</span>
          </div>

          {/* Title - Both languages */}
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            مرحباً بكم في مدرسة السودان
          </h1>
          <p className="text-lg text-gray-600 mb-8">
            Welcome to Madrassa Sudan
          </p>

          {/* Language selection prompt */}
          <p className="text-gray-700 mb-2 font-medium">اختر لغتك المفضلة</p>
          <p className="text-gray-500 text-sm mb-6">Choose your preferred language</p>

          {/* Language buttons */}
          <div className="space-y-3">
            {/* Arabic option */}
            <button
              onClick={() => handleSelectLanguage("ar")}
              className="w-full py-4 px-6 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-xl font-semibold hover:from-emerald-700 hover:to-emerald-800 transition-all shadow-lg shadow-emerald-600/20 hover:shadow-emerald-600/30 hover:-translate-y-0.5 flex items-center justify-center gap-3"
            >
              <span className="text-2xl">🇸🇩</span>
              <span className="text-lg">العربية</span>
              <span className="text-sm opacity-80">(Arabic)</span>
            </button>

            {/* English option */}
            <button
              onClick={() => handleSelectLanguage("en")}
              className="w-full py-4 px-6 bg-white border-2 border-gray-200 text-gray-800 rounded-xl font-semibold hover:border-emerald-500 hover:bg-emerald-50 transition-all hover:-translate-y-0.5 flex items-center justify-center gap-3"
            >
              <span className="text-2xl">🌍</span>
              <span className="text-lg">English</span>
              <span className="text-sm text-gray-500">(الإنجليزية)</span>
            </button>
          </div>

          {/* Note about changing later */}
          <p className="mt-6 text-xs text-gray-400">
            يمكنك تغيير اللغة لاحقاً • You can change this later
          </p>
        </div>
      </div>
    </div>
  );
}
