// Where the email-updates box starts unticked. A pre-ticked box doesn't count
// as consent under UK and EU data-protection rules, so sign-ups from the UK,
// the EU, the EEA and Switzerland start unticked; everywhere else starts ticked.

const PROTECTED_COUNTRIES_EN = [
  "united kingdom", "uk", "u.k.", "great britain", "britain", "england", "scotland", "wales", "northern ireland",
  "austria", "belgium", "bulgaria", "croatia", "cyprus", "czech republic", "czechia", "denmark", "estonia",
  "finland", "france", "germany", "greece", "hungary", "ireland", "italy", "latvia", "lithuania", "luxembourg",
  "malta", "netherlands", "holland", "poland", "portugal", "romania", "slovakia", "slovenia", "spain", "sweden",
  "iceland", "liechtenstein", "norway", "switzerland",
];

const PROTECTED_COUNTRIES_AR = [
  "المملكة المتحدة", "بريطانيا", "انجلترا", "إنجلترا", "إنكلترا", "اسكتلندا", "ويلز", "ايرلندا", "أيرلندا",
  "النمسا", "بلجيكا", "بلغاريا", "كرواتيا", "قبرص", "التشيك", "الدنمارك", "استونيا", "إستونيا", "فنلندا",
  "فرنسا", "المانيا", "ألمانيا", "اليونان", "المجر", "ايطاليا", "إيطاليا", "لاتفيا", "ليتوانيا", "لوكسمبورغ",
  "مالطا", "هولندا", "بولندا", "البرتغال", "رومانيا", "سلوفاكيا", "سلوفينيا", "اسبانيا", "إسبانيا", "السويد",
  "ايسلندا", "آيسلندا", "ليختنشتاين", "النرويج", "سويسرا",
];

// European time zones that aren't under "Europe/".
const PROTECTED_ATLANTIC_ZONES = new Set([
  "Atlantic/Canary",
  "Atlantic/Madeira",
  "Atlantic/Azores",
  "Atlantic/Reykjavik",
  "Atlantic/Faroe",
]);

const latinPattern = new RegExp(
  `(^|[^a-z])(${PROTECTED_COUNTRIES_EN.map((name) => name.replace(/[.]/g, "\\.")).join("|")})(?=$|[^a-z])`,
  "i",
);

/** True for European time zones. Errs towards protection (all of Europe/*). */
export function isProtectedTimeZone(timeZone: string | null | undefined) {
  if (!timeZone) return false;
  return timeZone.startsWith("Europe/") || PROTECTED_ATLANTIC_ZONES.has(timeZone);
}

/** True when free text such as "London, UK" or "ألمانيا" names a protected country. */
export function mentionsProtectedCountry(text: string | null | undefined) {
  const value = text?.trim() ?? "";
  if (!value) return false;
  if (latinPattern.test(value)) return true;
  return PROTECTED_COUNTRIES_AR.some((name) => value.includes(name));
}

/** Whether the email-updates box should start ticked for this sign-up. */
export function defaultEmailUpdatesOptIn({
  timeZone,
  countryText,
}: {
  timeZone: string | null | undefined;
  countryText: string | null | undefined;
}) {
  return !(isProtectedTimeZone(timeZone) || mentionsProtectedCountry(countryText));
}
