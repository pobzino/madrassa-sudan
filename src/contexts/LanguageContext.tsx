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

const LANGUAGE_KEY = "madrassa-sudan-language";
const HAS_SELECTED_KEY = "madrassa-sudan-has-selected-language";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("ar");
  const [hasSelectedLanguage, setHasSelectedLanguageState] = useState(true); // Default to true to prevent flash
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize from localStorage and URL params
  useEffect(() => {
    // Check URL params for testing
    const urlParams = new URLSearchParams(window.location.search);
    const langParam = urlParams.get("lang") as Language | null;
    const resetParam = urlParams.get("reset-lang");

    // Handle reset param - clears stored selection to show modal
    if (resetParam !== null) {
      localStorage.removeItem(HAS_SELECTED_KEY);
      setHasSelectedLanguageState(false);
      // Clean up URL
      urlParams.delete("reset-lang");
      const newUrl = urlParams.toString()
        ? `${window.location.pathname}?${urlParams.toString()}`
        : window.location.pathname;
      window.history.replaceState({}, "", newUrl);
      setIsInitialized(true);
      return;
    }

    // Handle lang param - forces specific language
    if (langParam && (langParam === "ar" || langParam === "en")) {
      setLanguageState(langParam);
      localStorage.setItem(LANGUAGE_KEY, langParam);
      localStorage.setItem(HAS_SELECTED_KEY, "true");
      setHasSelectedLanguageState(true);
      // Clean up URL
      urlParams.delete("lang");
      const newUrl = urlParams.toString()
        ? `${window.location.pathname}?${urlParams.toString()}`
        : window.location.pathname;
      window.history.replaceState({}, "", newUrl);
      setIsInitialized(true);
      return;
    }

    // Normal initialization from localStorage
    const storedLanguage = localStorage.getItem(LANGUAGE_KEY) as Language | null;
    const storedHasSelected = localStorage.getItem(HAS_SELECTED_KEY);

    if (storedLanguage) {
      setLanguageState(storedLanguage);
    }

    // If user has never selected a language, show the selector
    setHasSelectedLanguageState(storedHasSelected === "true");
    setIsInitialized(true);
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
