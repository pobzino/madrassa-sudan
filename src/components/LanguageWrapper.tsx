"use client";

import { ReactNode, useEffect } from "react";
import { LanguageProvider, useLanguage } from "@/contexts/LanguageContext";
import { LanguageSelector } from "./LanguageSelector";


function LanguageDirectionHandler({ children }: { children: ReactNode }) {
  const { language, isInitialized } = useLanguage();

  useEffect(() => {
    if (isInitialized) {
      document.documentElement.lang = language;
      document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    }
  }, [language, isInitialized]);

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
