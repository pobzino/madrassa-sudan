/** Choices are exact because capitalisation can be the skill assessed. */
export function practiceAnswerMatches(response: string, correct: string, type: string): boolean {
  if (type !== "short_answer") return response === correct;
  const normalize = (value: string) => value
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0)).trim();
  const r = normalize(response);
  const c = normalize(correct);
  if (!r || !c) return false;
  if (r === c) return true;
  // A single-letter entry can explicitly assess uppercase/lowercase forms.
  if (/^[A-Za-z]$/.test(c)) return false;
  const rn = Number(r.replace(",", "."));
  const cn = Number(c.replace(",", "."));
  if (Number.isFinite(rn) && Number.isFinite(cn)) return Math.abs(rn - cn) < 1e-9;
  return r.toLowerCase() === c.toLowerCase();
}
