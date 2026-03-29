"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Language = "ar" | "en";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  isRtl: boolean;
  hasSelectedLanguage: boolean;
  setHasSelectedLanguage: (value: boolean) => void;
  isInitialized: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const LANGUAGE_KEY = "amal-madrassa-language";
const HAS_SELECTED_KEY = "amal-madrassa-has-selected-language";

type BrowserLanguageState = {
  cleanupParam: "lang" | "reset-lang" | null;
  hasSelectedLanguage: boolean;
  language: Language;
};

function getBrowserLanguageState(): BrowserLanguageState {
  const urlParams = new URLSearchParams(window.location.search);
  const langParam = urlParams.get("lang");
  const resetParam = urlParams.get("reset-lang");
  const storedLanguage = localStorage.getItem(LANGUAGE_KEY);
  const storedHasSelected = localStorage.getItem(HAS_SELECTED_KEY);
  const nextLanguage = storedLanguage === "ar" || storedLanguage === "en" ? storedLanguage : "ar";

  if (resetParam !== null) {
    localStorage.removeItem(HAS_SELECTED_KEY);
    return {
      cleanupParam: "reset-lang",
      hasSelectedLanguage: false,
      language: nextLanguage,
    };
  }

  if (langParam === "ar" || langParam === "en") {
    localStorage.setItem(LANGUAGE_KEY, langParam);
    localStorage.setItem(HAS_SELECTED_KEY, "true");
    return {
      cleanupParam: "lang",
      hasSelectedLanguage: true,
      language: langParam,
    };
  }

  return {
    cleanupParam: null,
    hasSelectedLanguage: storedHasSelected === "true",
    language: nextLanguage,
  };
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("ar");
  const [hasSelectedLanguage, setHasSelectedLanguageState] = useState(true); // Match SSR on first render.
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const nextState = getBrowserLanguageState();
    const initTimeout = setTimeout(() => {
      if (nextState.cleanupParam) {
        const urlParams = new URLSearchParams(window.location.search);
        urlParams.delete(nextState.cleanupParam);
        const newUrl = urlParams.toString()
          ? `${window.location.pathname}?${urlParams.toString()}`
          : window.location.pathname;
        window.history.replaceState({}, "", newUrl);
      }

      if (nextState.language !== "ar") {
        setLanguageState(nextState.language);
      }
      setHasSelectedLanguageState(nextState.hasSelectedLanguage);
      setIsInitialized(true);
    }, 0);

    return () => clearTimeout(initTimeout);
  }, []);

  // Update localStorage and document direction when language changes
  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem(LANGUAGE_KEY, language);
      document.documentElement.lang = language;
      document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    }
  }, [language, isInitialized]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const setHasSelectedLanguage = (value: boolean) => {
    setHasSelectedLanguageState(value);
    localStorage.setItem(HAS_SELECTED_KEY, String(value));
  };

  const isRtl = language === "ar";

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        isRtl,
        hasSelectedLanguage,
        setHasSelectedLanguage,
        isInitialized,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
