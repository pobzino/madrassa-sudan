/**
 * Maths expressions in prompts ("7 + 5?", "١٢ ÷ ٣ =") must never wrap
 * inside themselves. Pure, so it is unit-tested; MathText renders it.
 */

/** A number, then one or more "operator number" steps, with an optional ? or = at the end. */
export const MATH_EXPRESSION = /[0-9٠-٩۰-۹]+(?:[.,][0-9٠-٩۰-۹]+)?(?:\s*[-+−–×x*÷/=<>]\s*[0-9٠-٩۰-۹]+(?:[.,][0-9٠-٩۰-۹]+)?)+(?:\s*[=?؟])?/g;

/** Splits text into plain runs and maths expressions (the expressions marked). */
export function splitMath(text: string): Array<{ text: string; math: boolean }> {
  const parts: Array<{ text: string; math: boolean }> = [];
  let last = 0;
  for (const match of text.matchAll(MATH_EXPRESSION)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ text: text.slice(last, start), math: false });
    parts.push({ text: match[0], math: true });
    last = start + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), math: false });
  return parts;
}
