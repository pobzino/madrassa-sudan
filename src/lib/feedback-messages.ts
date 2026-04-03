/**
 * Encouraging feedback messages for student activities and homework.
 * Rotates through gentle, encouraging phrases instead of harsh "Incorrect" / "Wrong".
 */

const incorrectMessages = {
  ar: [
    'قاربت! حاول مرة أخرى',
    'ليس تماماً — حاول مرة أخرى',
    'محاولة جيدة! حاول مرة أخرى',
    'هيا نفكر مرة أخرى',
  ],
  en: [
    'Almost there! Try again',
    'Not quite — give it another shot',
    'Good try! Try once more',
    'Hmm, let\u2019s think about this again',
  ],
};

const correctMessages = {
  ar: [
    'إجابة صحيحة! 🎉',
    'أحسنت! 🌟',
    'ممتاز! 👏',
    'رائع! 🎉',
  ],
  en: [
    'Correct! 🎉',
    'Well done! 🌟',
    'Excellent! 👏',
    'Great job! 🎉',
  ],
};

const lowScoreMessages = {
  ar: [
    'واصل المحاولة، ستتحسن! 💪',
    'لا بأس، التعلم يحتاج وقت!',
    'حاول مرة أخرى، أنت تتعلم! 💪',
    'استمر، أنت في الطريق الصحيح!',
  ],
  en: [
    'Keep going, you\u2019ll get there! 💪',
    'No worries, learning takes time!',
    'Try again, you\u2019re learning! 💪',
    'Keep at it, you\u2019re on the right track!',
  ],
};

const incorrectIndex = { ar: 0, en: 0 };
const correctIndex = { ar: 0, en: 0 };
const lowScoreIndex = { ar: 0, en: 0 };

/** Returns a rotating encouraging message for an incorrect answer. */
export function getIncorrectFeedback(lang: 'ar' | 'en'): string {
  const messages = incorrectMessages[lang];
  const msg = messages[incorrectIndex[lang] % messages.length];
  incorrectIndex[lang]++;
  return msg;
}

/** Returns a rotating message for a correct answer. */
export function getCorrectFeedback(lang: 'ar' | 'en'): string {
  const messages = correctMessages[lang];
  const msg = messages[correctIndex[lang] % messages.length];
  correctIndex[lang]++;
  return msg;
}

/** Returns a rotating encouraging message for a low score. */
export function getLowScoreFeedback(lang: 'ar' | 'en'): string {
  const messages = lowScoreMessages[lang];
  const msg = messages[lowScoreIndex[lang] % messages.length];
  lowScoreIndex[lang]++;
  return msg;
}
