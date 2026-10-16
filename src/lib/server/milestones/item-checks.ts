// Deterministic sense checks for battle items, beyond structure: does the key
// really answer the question, and is there exactly one defensible answer?
// Pure (no server-only imports) so validators and tests share it. Each check
// returns a staff-readable error, or null when the item passes (or the check
// does not apply: these only fire when the content can be read with certainty).

type Text = { ar: string; en: string };
type List = { ar: string[]; en: string[] };

/** Western digits for Arabic-Indic / Persian ones; Arabic decimal comma to a dot. */
export function westernDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".");
}

/** The number a plain-number item stands for ("7", "٧", "3.5"), else null. */
export function plainNumber(value: string): number | null {
  const text = westernDigits(value).trim().replace(/[.!؟?]+$/u, "").replace(/(\d),(\d{3})\b/g, "$1$2");
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null;
  return Number(text);
}

function allNumbers(values: string[]): number[] | null {
  if (!values.length) return null;
  const numbers = values.map(plainNumber);
  return numbers.every((n): n is number => n !== null) ? numbers : null;
}

const OPERATOR_WORDS: Array<[RegExp, string]> = [
  [/\btake away\b|\bminus\b|ناقص|\bless\b(?=\s*\d)/giu, "-"],
  [/\bplus\b|\badd\b(?=\s*\d)|زائد/giu, "+"],
  [/\btimes\b|ضرب|في(?=\s*\d)/giu, "×"],
];

function withOperators(value: string): string {
  // "1-10" with no spaces is a range, not a subtraction.
  let text = westernDigits(value).replace(/(\d)-(\d)/g, "$1–$2");
  for (const [pattern, symbol] of OPERATOR_WORDS) text = text.replace(pattern, ` ${symbol} `);
  return text.replace(/(\d)\s*[xX]\s*(\d)/g, "$1 × $2");
}

// "3 + 4", and "7 stars, take away 3" (one counted word may sit between).
const EXPRESSION = /(-?\d+(?:\.\d+)?)\s*(?:[A-Za-z؀-ۿ]+\s*,?\s*)?([+\-−×÷*])\s*(\d+(?:\.\d+)?)/g;
const CHAINED = /\d\s*[+\-−×÷*]\s*\d+(?:\.\d+)?\s*[+\-−×÷*]\s*\d/;

function evaluate(a: number, op: string, b: number): number | null {
  switch (op) {
    case "+": return a + b;
    case "-": case "−": return a - b;
    case "×": case "*": return a * b;
    case "÷": return b === 0 ? null : a / b;
    default: return null;
  }
}

/** The value of the ONE simple arithmetic expression in a text ("3 + 4", "7 take away 3"), else null. */
export function singleExpressionValue(value: string): number | null {
  const text = withOperators(value);
  if (CHAINED.test(text)) return null;
  const matches = [...text.matchAll(EXPRESSION)];
  if (matches.length !== 1) return null;
  const [, a, op, b] = matches[0];
  return evaluate(Number(a), op, Number(b));
}

/** "a op b = c" in a statement: whether it is true, else null when there is no single equation. */
export function equationTruth(value: string): boolean | null {
  const text = withOperators(value);
  const matches = [...text.matchAll(/(-?\d+(?:\.\d+)?)\s*([+\-−×÷*])\s*(\d+(?:\.\d+)?)\s*(?:=|\bis\b|\bequals\b|\bmakes\b|يساوي)\s*(-?\d+(?:\.\d+)?)/giu)];
  if (matches.length !== 1 || CHAINED.test(text)) return null;
  const [, a, op, b, c] = matches[0];
  const result = evaluate(Number(a), op, Number(b));
  return result === null ? null : Math.abs(result - Number(c)) < 1e-9;
}

/** A question that compares or estimates is not "work out the sum": skip key checks on it. */
const NOT_A_SUM = /\b(not|bigger|biggest|smaller|smallest|more|less|fewer|greater|closest|nearest|about|estimate|round|which (?:sum|one)|odd one)\b|أكبر|أصغر|أكثر|أقل|ليس|تقريب/iu;

function promptText(prompt: Text) {
  return prompt.en || prompt.ar;
}

/** choose_correct / fill choices: numeric options must have one value, and an arithmetic prompt one right option (the key). */
export function checkChoiceKey(prompt: Text, options: List, correctIndex: number): string | null {
  const numbers = allNumbers(options.en.length ? options.en : options.ar) ?? allNumbers(options.ar);
  if (!numbers) return null;
  if (new Set(numbers).size !== numbers.length) return "Two options are the same number.";
  const text = promptText(prompt);
  if (NOT_A_SUM.test(text)) return null;
  const value = singleExpressionValue(text);
  if (value === null) return null;
  const right = numbers.filter((n) => Math.abs(n - value) < 1e-9).length;
  if (right === 0) return `None of the options is the answer (${value}).`;
  if (Math.abs(numbers[correctIndex] - value) >= 1e-9) return `The marked option is wrong: the answer is ${value}.`;
  return null;
}

export function checkTrueFalseKey(prompt: Text, answer: boolean): string | null {
  const truth = equationTruth(prompt.en) ?? equationTruth(prompt.ar);
  if (truth === null) return null;
  return truth === answer ? null : `The sentence is ${truth ? "true" : "false"}, but it is marked ${answer ? "true" : "false"}.`;
}

/** tap_to_count: an arithmetic prompt must count to the target; a "Count 5 apples!" prompt must say the target. */
export function checkTapTarget(prompt: Text, target: number): string | null {
  const text = promptText(prompt);
  const value = singleExpressionValue(text);
  if (value !== null) {
    return Number.isInteger(value) && value === target ? null : `The answer to the question is ${value}, not ${target}.`;
  }
  const numbers = (westernDigits(text).match(/\d+/g) ?? []).map(Number);
  if (numbers.length === 1 && /\bcount\b|\btap\b|عُ?دّ|اضغط|انقر/iu.test(text) && !/[?؟]/.test(text)) {
    return numbers[0] === target ? null : `The prompt says ${numbers[0]} but the count is ${target}.`;
  }
  return null;
}

const COMPOUND_EN = /\b(and|or|with)\b|[&+,/]/i;
const COMPOUND_AR = /\sو\s|\sو(?=[0-9٠-٩])|\sأو\s|[،,+&/]/u;

function hasTwoNumbers(value: string) {
  return (westernDigits(value).match(/\d+(?:\.\d+)?/g) ?? []).length > 1;
}

type Direction = "asc" | "desc" | null;

function statedDirection(prompt: Text): Direction {
  const en = prompt.en.toLowerCase();
  const ar = prompt.ar;
  const big = "(biggest|largest|greatest|most|tallest|longest|heaviest|oldest|highest|latest)";
  const small = "(smallest|least|fewest|shortest|lightest|youngest|lowest|earliest)";
  if (new RegExp(`${big}\\b.*\\bto\\b.*\\b${small}`).test(en) || /من الأكبر|من الأطول|من الأكثر|من الأثقل/u.test(ar)) return "desc";
  if (new RegExp(`${small}\\b.*\\bto\\b.*\\b${big}`).test(en) || /من الأصغر|من الأقصر|من الأقل|من الأخف/u.test(ar)) return "asc";
  if (/\b(descending|count(?:ing)? down)\b/.test(en)) return "desc";
  if (/\b(ascending|count(?:ing)? up)\b/.test(en)) return "asc";
  return null;
}

function strictlyMonotonic(values: number[], direction: Direction): "asc" | "desc" | null {
  const asc = values.every((v, i) => i === 0 || v > values[i - 1]);
  const desc = values.every((v, i) => i === 0 || v < values[i - 1]);
  if (direction === "asc") return asc ? "asc" : null;
  if (direction === "desc") return desc ? "desc" : null;
  return asc ? "asc" : desc ? "desc" : null;
}

/**
 * sequence_order: single, directly comparable values with exactly one order.
 * Rejects compound items ("3 and 7"), repeated values, and, where the items
 * can be compared mechanically (numbers, word length, alphabet), a stored
 * order that is not the one strict order under the stated criterion.
 */
export function checkSequence(prompt: Text, items: List): string | null {
  for (const [index, item] of items.en.entries()) {
    const ar = items.ar[index] ?? "";
    if (COMPOUND_EN.test(item) || COMPOUND_AR.test(ar) || hasTwoNumbers(item) || hasTwoNumbers(ar)) {
      return `Step ${index + 1} ("${item}") holds more than one value; each step must be one thing to compare.`;
    }
  }
  const direction = statedDirection(prompt);
  const numbers = allNumbers(items.en) ?? allNumbers(items.ar);
  if (numbers) {
    if (new Set(numbers).size !== numbers.length) return "Two steps have the same value, so there is no single order.";
    if (!strictlyMonotonic(numbers, direction)) {
      return direction
        ? `The steps are not stored ${direction === "asc" ? "smallest to biggest" : "biggest to smallest"}, as the question asks.`
        : "The numbers are not stored in one clear order (smallest to biggest or biggest to smallest).";
    }
    return null;
  }
  const en = prompt.en.toLowerCase();
  const singleWords = items.en.every((item) => /^[A-Za-z]+$/.test(item.trim()));
  if (singleWords && /\b(shortest|longest|letters?)\b/.test(en)) {
    const lengths = items.en.map((item) => item.trim().length);
    if (new Set(lengths).size !== lengths.length) return "Two words have the same length, so there is no single order.";
    if (!strictlyMonotonic(lengths, direction)) return "The words are not stored in length order.";
  }
  if (singleWords && /\balphabet(?:ical)?\b|\babc\b/.test(en)) {
    const words = items.en.map((item) => item.trim().toLowerCase());
    if (!words.every((word, i) => i === 0 || word.localeCompare(words[i - 1], "en") > 0)) {
      return "The words are not stored in alphabetical order.";
    }
  }
  return null;
}

/** match_pairs: numbers must be distinct values; sums must match their keyed partner. */
export function checkPairs(items: List, targets: List): string | null {
  const itemNumbers = allNumbers(items.en) ?? allNumbers(items.ar);
  const targetNumbers = allNumbers(targets.en) ?? allNumbers(targets.ar);
  if (itemNumbers && new Set(itemNumbers).size !== itemNumbers.length) return "Two items are the same number.";
  if (targetNumbers && new Set(targetNumbers).size !== targetNumbers.length) return "Two partners are the same number, so a pair could swap.";
  const sides: Array<[string[], number[] | null]> = [[items.en, targetNumbers], [targets.en, itemNumbers]];
  for (const [expressions, numbers] of sides) {
    if (!numbers) continue;
    const values = expressions.map(singleExpressionValue);
    if (values.every((v): v is number => v !== null)) {
      const wrong = values.findIndex((v, i) => Math.abs(v - numbers[i]) >= 1e-9);
      if (wrong >= 0) return `Pair ${wrong + 1} does not add up: ${expressions[wrong]} is ${values[wrong]}.`;
      if (new Set(values).size !== values.length) return "Two sums have the same answer, so a pair could swap.";
    }
  }
  return null;
}

/** sort_groups: every group used, no repeated numbers, and even/odd sorted correctly. */
export function checkGroups(items: List, targets: List, solutionMap: number[]): string | null {
  const used = new Set(solutionMap);
  if (targets.ar.some((_, index) => !used.has(index))) return "Every group needs at least one item.";
  const numbers = allNumbers(items.en) ?? allNumbers(items.ar);
  if (numbers && new Set(numbers).size !== numbers.length) return "Two items are the same number.";
  const groups = targets.en.map((target, i) => `${target} ${targets.ar[i] ?? ""}`.toLowerCase());
  const even = groups.findIndex((g) => /\beven\b|زوجي/u.test(g));
  const odd = groups.findIndex((g) => /\bodd\b|فردي/u.test(g));
  if (numbers && even >= 0 && odd >= 0) {
    const wrong = numbers.findIndex((n, i) => Number.isInteger(n) && solutionMap[i] !== (Math.abs(n) % 2 === 0 ? even : odd));
    if (wrong >= 0) return `${items.en[wrong]} is in the wrong group (even/odd).`;
  }
  return null;
}
