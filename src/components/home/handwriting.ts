import { Aref_Ruqaa, Caveat } from "next/font/google";
import type { Language } from "@/contexts/LanguageContext";

// Handwritten notes and hints around the owl.
const handLatin = Caveat({ subsets: ["latin"], weight: ["600", "700"], display: "swap" });
const handArabic = Aref_Ruqaa({ subsets: ["arabic"], weight: ["700"], display: "swap" });

export function handwritingClass(language: Language) {
  return language === "ar" ? handArabic.className : handLatin.className;
}
