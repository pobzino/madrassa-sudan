// Randomised encouragement phrases for the Practice player.
// Shuffle-bag per pool so students never see the same phrase twice in a row.

export type PracticeLang = "ar" | "en";

const POOLS = {
  correct: {
    en: [
      "Well done!",
      "Great thinking!",
      "You got it!",
      "Brilliant!",
      "Exactly right!",
      "Nice work!",
      "Keep it up!",
      "That's it!",
    ],
    ar: [
      "أحسنت!",
      "ممتاز!",
      "إجابة صحيحة، رائع!",
      "عمل جميل!",
      "أصبت!",
      "تفكير ذكي!",
      "واصل التقدم!",
      "هذا صحيح تماماً!",
    ],
  },
  streak: {
    en: [
      "Three in a row — you're on fire!",
      "What a streak, keep going!",
      "Unstoppable!",
    ],
    ar: [
      "ثلاث إجابات متتالية — مذهل!",
      "سلسلة رائعة، واصل!",
      "لا أحد يوقفك!",
    ],
  },
  wrong: {
    en: [
      "Almost! The green one is the answer.",
      "Good try — now you know it.",
      "Not quite, take a look at the right answer.",
      "That was a tricky one. You'll get the next one!",
    ],
    ar: [
      "قريب! الإجابة هي الخضراء.",
      "محاولة طيبة — الآن عرفت الإجابة.",
      "ليست هذه، انظر إلى الإجابة الصحيحة.",
      "كان سؤالاً صعباً. ستصيب في السؤال القادم!",
    ],
  },
  pass: {
    en: ["Amazing work! You finished this practice!", "You did it — lesson complete!"],
    ar: ["عمل مذهل! أكملت هذا التدريب!", "أحسنت — اكتمل الدرس!"],
  },
  tryAgain: {
    en: [
      "Good practice! One more try and you'll master it.",
      "You're learning — let's try once more together.",
    ],
    ar: [
      "تدريب جيد! محاولة أخرى وستتقنه.",
      "أنت تتعلم — لنحاول مرة أخرى معاً.",
    ],
  },
} as const;

export type PhrasePool = keyof typeof POOLS;

const bags: Partial<Record<string, string[]>> = {};

/** Draw a phrase from the pool without repeating until the pool is exhausted. */
export function drawPhrase(pool: PhrasePool, lang: PracticeLang): string {
  const key = `${pool}:${lang}`;
  let bag = bags[key];
  if (!bag || bag.length === 0) {
    bag = [...POOLS[pool][lang]].sort(() => Math.random() - 0.5);
    bags[key] = bag;
  }
  return bag.pop() as string;
}
