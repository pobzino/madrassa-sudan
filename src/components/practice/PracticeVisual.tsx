"use client";

import type { LucideIcon } from "lucide-react";
import {
  Apple,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Circle,
  Flower2,
  Pencil,
  Star,
  Volleyball,
} from "lucide-react";
import { normalizeArabicDigits } from "@/lib/whatsapp-login";
import type { PracticeLang } from "./encouragement";

type CountObject = "apple" | "star" | "ball" | "book" | "pencil" | "flower" | "dot";

export type PracticeVisualSpec =
  | { kind: "count"; count: number; object: CountObject }
  | { kind: "number_path"; target: number; relation: "before" | "after" }
  | { kind: "equation"; left: number; operator: "+" | "-" | "×" | "÷"; right: number };

const OBJECT_WORDS: Array<{ object: CountObject; pattern: RegExp }> = [
  { object: "apple", pattern: /(?:apples?|تفاح(?:ات)?)/i },
  { object: "star", pattern: /(?:stars?|نجوم?)/i },
  { object: "ball", pattern: /(?:balls?|كرات?)/i },
  { object: "book", pattern: /(?:books?|كتب|كتاب)/i },
  { object: "pencil", pattern: /(?:pencils?|أقلام|قلم)/i },
  { object: "flower", pattern: /(?:flowers?|زهور|ورود)/i },
  { object: "dot", pattern: /(?:dots?|circles?|نقاط|دوائر)/i },
];

const OBJECT_ICONS: Record<CountObject, LucideIcon> = {
  apple: Apple,
  star: Star,
  ball: Volleyball,
  book: BookOpen,
  pencil: Pencil,
  flower: Flower2,
  dot: Circle,
};

const OBJECT_STYLES: Record<CountObject, string> = {
  apple: "border-red-200 bg-red-50 text-red-600",
  star: "border-amber-200 bg-amber-50 text-amber-500",
  ball: "border-sky-200 bg-sky-50 text-sky-600",
  book: "border-emerald-200 bg-emerald-50 text-emerald-700",
  pencil: "border-orange-200 bg-orange-50 text-orange-600",
  flower: "border-rose-200 bg-rose-50 text-rose-500",
  dot: "border-violet-200 bg-violet-50 text-violet-600",
};

const NUMBER_WORDS: Array<{ pattern: RegExp; value: number }> = [
  { pattern: /\b(?:twelve)\b|(?:اثنا عشر|اثنتا عشرة)/i, value: 12 },
  { pattern: /\b(?:eleven)\b|(?:أحد عشر|إحدى عشرة)/i, value: 11 },
  { pattern: /\b(?:ten)\b|(?:عشر|عشرة)/i, value: 10 },
  { pattern: /\b(?:nine)\b|(?:تسع|تسعة)/i, value: 9 },
  { pattern: /\b(?:eight)\b|(?:ثمان|ثمانية)/i, value: 8 },
  { pattern: /\b(?:seven)\b|(?:سبع|سبعة)/i, value: 7 },
  { pattern: /\b(?:six)\b|(?:ست|ستة)/i, value: 6 },
  { pattern: /\b(?:five)\b|(?:خمس|خمسة)/i, value: 5 },
  { pattern: /\b(?:four)\b|(?:أربع|أربعة)/i, value: 4 },
  { pattern: /\b(?:three)\b|(?:ثلاث|ثلاثة)/i, value: 3 },
  { pattern: /\b(?:two)\b|(?:اثنان|اثنتان|اثنين|اثنتين)/i, value: 2 },
  { pattern: /\b(?:one)\b|(?:واحد|واحدة)/i, value: 1 },
];

function normalizedQuestion(text: string) {
  return normalizeArabicDigits(text).replace(/[−–—]/g, "-");
}

function extractCount(text: string) {
  const digitMatch = text.match(/\b(\d{1,2})\b/);
  if (digitMatch) return Number(digitMatch[1]);
  return NUMBER_WORDS.find((candidate) => candidate.pattern.test(text))?.value ?? 0;
}

export function detectPracticeVisual(prompt: string): PracticeVisualSpec | null {
  const text = normalizedQuestion(prompt);

  for (const candidate of OBJECT_WORDS) {
    if (!candidate.pattern.test(text)) continue;
    const count = extractCount(text);
    if (count >= 1 && count <= 12) {
      return { kind: "count", count, object: candidate.object };
    }
  }

  const before = text.match(/(?:before|قبل)\s+(?:the\s+number\s+)?(\d{1,3})/i);
  if (before) return { kind: "number_path", target: Number(before[1]), relation: "before" };

  const after = text.match(/(?:after|بعد)\s+(?:the\s+number\s+)?(\d{1,3})/i);
  if (after) return { kind: "number_path", target: Number(after[1]), relation: "after" };

  const equation = text.match(/\b(\d{1,2})\s*([+\-×÷])\s*(\d{1,2})\b/);
  if (equation) {
    return {
      kind: "equation",
      left: Number(equation[1]),
      operator: equation[2] as "+" | "-" | "×" | "÷",
      right: Number(equation[3]),
    };
  }

  return null;
}

function NumberTile({ value, answer = false }: { value: number | null; answer?: boolean }) {
  return (
    <span
      className={`grid h-12 min-w-12 place-items-center rounded-lg border-2 px-3 text-xl font-black shadow-[0_4px_0_rgba(45,65,52,0.12)] sm:h-14 sm:min-w-14 sm:text-2xl ${
        value === null
          ? "border-amber-400 bg-amber-50 text-amber-700"
          : answer
            ? "border-emerald-500 bg-emerald-600 text-white"
            : "border-emerald-200 bg-white text-emerald-900"
      }`}
    >
      {value ?? "?"}
    </span>
  );
}

function NumberPath({ target, relation, lang }: Extract<PracticeVisualSpec, { kind: "number_path" }> & { lang: PracticeLang }) {
  const values =
    relation === "after"
      ? [Math.max(0, target - 1), target, null, target + 2]
      : [Math.max(0, target - 3), Math.max(0, target - 2), null, target];
  const Arrow = lang === "ar" ? ArrowLeft : ArrowRight;

  return (
    <div className="flex items-center justify-center gap-1.5 sm:gap-3" dir={lang === "ar" ? "rtl" : "ltr"}>
      {values.map((value, index) => (
        <div key={`${value ?? "missing"}-${index}`} className="contents">
          <NumberTile value={value} answer={value === target} />
          {index < values.length - 1 && <Arrow className="h-5 w-5 shrink-0 text-emerald-700" strokeWidth={3} aria-hidden="true" />}
        </div>
      ))}
    </div>
  );
}

export function PracticeQuestionVisual({ prompt, lang }: { prompt: string; lang: PracticeLang }) {
  const visual = detectPracticeVisual(prompt);
  if (!visual) return null;
  if (visual.kind === "count" && /(?:which group|أي مجموعة)/i.test(prompt)) return null;

  return (
    <div className="border-t-2 border-white/80 bg-white/75 px-4 py-4 sm:px-8 sm:py-5">
      <div className="mx-auto max-w-2xl rounded-lg border-2 border-emerald-100 bg-[#FBFFF9] px-4 py-4 shadow-[0_5px_0_rgba(31,92,52,0.09)] sm:px-6">
        {visual.kind === "count" && (() => {
          const Icon = OBJECT_ICONS[visual.object];
          return (
            <div className="mx-auto grid w-fit grid-cols-5 gap-2 sm:grid-cols-6 sm:gap-3" aria-label={`${visual.count}`}>
              {Array.from({ length: visual.count }, (_, index) => (
                <span
                  key={index}
                  className={`grid h-11 w-11 place-items-center rounded-lg border-2 shadow-sm sm:h-[3.25rem] sm:w-[3.25rem] ${OBJECT_STYLES[visual.object]}`}
                >
                  <Icon className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2.5} fill="currentColor" fillOpacity={0.14} aria-hidden="true" />
                </span>
              ))}
            </div>
          );
        })()}

        {visual.kind === "number_path" && <NumberPath {...visual} lang={lang} />}

        {visual.kind === "equation" && (
          <div className="flex items-center justify-center gap-2 sm:gap-4" dir="ltr">
            <NumberTile value={visual.left} />
            <span className="text-3xl font-black text-emerald-700">{visual.operator}</span>
            <NumberTile value={visual.right} />
            <span className="text-3xl font-black text-emerald-700">=</span>
            <NumberTile value={null} />
          </div>
        )}
      </div>
    </div>
  );
}

const COLOURS: Array<{ pattern: RegExp; className: string }> = [
  { pattern: /^(?:red|أحمر|حمراء)$/i, className: "bg-red-500" },
  { pattern: /^(?:green|أخضر|خضراء)$/i, className: "bg-emerald-500" },
  { pattern: /^(?:blue|أزرق|زرقاء)$/i, className: "bg-sky-500" },
  { pattern: /^(?:yellow|أصفر|صفراء)$/i, className: "bg-amber-400" },
  { pattern: /^(?:orange|برتقالي|برتقالية)$/i, className: "bg-orange-500" },
  { pattern: /^(?:purple|بنفسجي|بنفسجية)$/i, className: "bg-violet-500" },
  { pattern: /^(?:black|أسود|سوداء)$/i, className: "bg-gray-900" },
  { pattern: /^(?:white|أبيض|بيضاء)$/i, className: "border-gray-300 bg-white" },
];

const SHAPES: Array<{ pattern: RegExp; className: string }> = [
  { pattern: /^(?:circle|دائرة)$/i, className: "rounded-full bg-sky-500" },
  { pattern: /^(?:square|مربع)$/i, className: "rounded-sm bg-emerald-500" },
  { pattern: /^(?:rectangle|مستطيل)$/i, className: "h-5 w-8 rounded-sm bg-amber-500" },
  { pattern: /^(?:triangle|مثلث)$/i, className: "practice-triangle" },
];

export function PracticeOptionVisual({ option }: { option: string }) {
  const trimmed = option.trim();
  const countVisual = detectPracticeVisual(trimmed);
  if (countVisual?.kind === "count") {
    const Icon = OBJECT_ICONS[countVisual.object];
    return (
      <span className="flex max-w-40 flex-wrap gap-1" aria-hidden="true">
        {Array.from({ length: countVisual.count }, (_, index) => (
          <Icon key={index} className="h-4 w-4 text-emerald-700 sm:h-5 sm:w-5" fill="currentColor" fillOpacity={0.16} strokeWidth={2.5} />
        ))}
      </span>
    );
  }

  const sequence = trimmed
    .split(/[,،]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (
    sequence.length >= 3 &&
    sequence.every((part) => /^-?\d+$/.test(normalizeArabicDigits(part)))
  ) {
    return (
      <span className="flex flex-wrap items-center gap-1.5" dir="ltr">
        {sequence.map((number, index) => (
          <span key={`${number}-${index}`} className="grid h-8 min-w-8 place-items-center rounded-md bg-emerald-50 px-1.5 text-sm font-black text-emerald-800">
            {number}
          </span>
        ))}
      </span>
    );
  }

  const colour = COLOURS.find((candidate) => candidate.pattern.test(trimmed));
  if (colour) {
    return <span aria-hidden="true" className={`h-8 w-8 shrink-0 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.12)] ${colour.className}`} />;
  }

  const shape = SHAPES.find((candidate) => candidate.pattern.test(trimmed));
  if (shape) {
    return <span aria-hidden="true" className={`h-7 w-7 shrink-0 ${shape.className}`} />;
  }

  return null;
}

export function isNumberSequenceOption(option: string) {
  const sequence = normalizeArabicDigits(option.trim())
    .split(/[,،]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  return sequence.length >= 3 && sequence.every((part) => /^-?\d+$/.test(part));
}
