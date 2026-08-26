"use client";

import { ReactNode, useEffect } from "react";
import { LanguageProvider, useLanguage } from "@/contexts/LanguageContext";
import { LanguageSelector } from "./LanguageSelector";


function LanguageDirectionHandler({ children }: { children: ReactNode }) {
  const { language, isInitialized, hasSelectedLanguage } = useLanguage();

  useEffect(() => {
    if (isInitialized) {
      document.documentElement.lang = language;
      document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    }
  }, [language, isInitialized]);

  return (
    <div
      className="contents"
      aria-hidden={!hasSelectedLanguage}
      inert={hasSelectedLanguage ? undefined : true}
    >
      {children}
    </div>
  );
}

export function LanguageWrapper({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <LanguageSelector />
      <LanguageDirectionHandler>
        {children}
      </LanguageDirectionHandler>
    </LanguageProvider>
  );
}
