"use client";

import { ReactNode, useEffect } from "react";
import { LanguageProvider, useLanguage } from "@/contexts/LanguageContext";
import { LanguageSelector } from "./LanguageSelector";

function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4">
        {/* Logo */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 flex items-center justify-center text-white font-bold text-3xl shadow-lg shadow-emerald-600/20 animate-pulse">
          م
        </div>
        {/* Loading spinner */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce" style={{ animationDelay: "0ms" }} />
          <div className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce" style={{ animationDelay: "150ms" }} />
          <div className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}

function LanguageDirectionHandler({ children }: { children: ReactNode }) {
  const { language, isInitialized } = useLanguage();

  useEffect(() => {
    if (isInitialized) {
      document.documentElement.lang = language;
      document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    }
  }, [language, isInitialized]);

  // Show loading screen while initializing
  if (!isInitialized) {
    return <LoadingScreen />;
  }

  return <>{children}</>;
}

export function LanguageWrapper({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <LanguageDirectionHandler>
        <LanguageSelector />
        {children}
      </LanguageDirectionHandler>
    </LanguageProvider>
  );
}
