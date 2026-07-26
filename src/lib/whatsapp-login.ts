// Parents can create an account without an email address: we derive a stable
// login identifier from their WhatsApp number. The domain never receives mail
// (email confirmations are disabled); it only satisfies the email format.

/** Convert Arabic-Indic (٠-٩) and Eastern Arabic (۰-۹) digits to Latin. */
export function normalizeArabicDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** Just the digits of a phone number, Arabic numerals included. */
export function whatsappDigits(value: string): string {
  return normalizeArabicDigits(value).replace(/\D/g, "");
}

/** Deterministic login email for a parent account created without email. */
export function whatsappLoginEmail(whatsapp: string): string {
  return `wa-${whatsappDigits(whatsapp)}@parents.amalschool.app`;
}

/**
 * Turn what the user typed into the login form into the email to authenticate
 * with: real emails pass through; anything that looks like a phone number maps
 * to the synthesized parent login email.
 */
export function loginIdentifierToEmail(identifier: string): string {
  const trimmed = identifier.trim();
  if (trimmed.includes("@")) return trimmed;
  const digits = whatsappDigits(trimmed);
  return digits.length >= 7 ? whatsappLoginEmail(trimmed) : trimmed;
}
