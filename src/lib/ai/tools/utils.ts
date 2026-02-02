export type LanguageCode = "ar" | "en";

export function getPreferredLanguage(language?: string): LanguageCode {
  return language === "ar" ? "ar" : "en";
}

export function localizeText(
  preferred: LanguageCode,
  ar?: string | null,
  en?: string | null,
  fallback: string = ""
): string {
  const primary = preferred === "ar" ? ar : en;
  const secondary = preferred === "ar" ? en : ar;
  return primary || secondary || fallback;
}

export function localizeSubjectName(
  preferred: LanguageCode,
  subject?: { name_ar?: string | null; name_en?: string | null } | null
): string | null {
  if (!subject) return null;
  return localizeText(preferred, subject.name_ar, subject.name_en, "");
}
