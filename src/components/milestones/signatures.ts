import type { BattleInteractionType, BossKey } from "@/lib/milestones/types";
import { BOSS_SIGNATURE_TYPES } from "@/lib/milestones/rules";

/**
 * Everything that makes each boss feel like itself, in one place: its
 * signature block-turn moves (themed skins over the shared moves, keyed by the
 * server's BOSS_SIGNATURE_TYPES), how it enters the arena, and its taunts.
 * Any type without a signature falls back to the generic orb / shield skin.
 */
export type SkinKey =
  | "dice"
  | "boulders"
  | "letters"
  | "bubbles"
  | "scrolls"
  | "sand"
  | "saddlebags"
  | "beds"
  | "seeds"
  | "puzzle"
  | "feathers";

export interface SignatureMove {
  name: { en: string; ar: string };
  skin: SkinKey;
}

const DICE_ROLL: SignatureMove = { name: { en: "Star Shower!", ar: "مطر النجوم!" }, skin: "dice" };
const NUMBER_BOULDERS: SignatureMove = { name: { en: "Number Boulders!", ar: "صخور الأرقام!" }, skin: "boulders" };
const JUMBLED_LETTERS: SignatureMove = { name: { en: "Jumbled Letters!", ar: "حروف مبعثرة!" }, skin: "letters" };
const SCROLL_SWAP: SignatureMove = { name: { en: "Scroll Swap!", ar: "تبديل اللفائف!" }, skin: "scrolls" };
const WORD_PUFF: SignatureMove = { name: { en: "Word Puff!", ar: "نفخة الكلمات!" }, skin: "bubbles" };
const SAND_LETTERS: SignatureMove = { name: { en: "Sand Letters!", ar: "حروف الرمل!" }, skin: "sand" };
const CARAVAN_MATCH: SignatureMove = { name: { en: "Caravan Match!", ar: "مطابقة القافلة!" }, skin: "saddlebags" };
const GARDEN_BEDS: SignatureMove = { name: { en: "Garden Beds!", ar: "أحواض الحديقة!" }, skin: "beds" };
const SEED_LINE: SignatureMove = { name: { en: "Seed Line!", ar: "صف البذور!" }, skin: "seeds" };
const PUZZLE_PIECES: SignatureMove = { name: { en: "Puzzle Pieces!", ar: "قطع اللغز!" }, skin: "puzzle" };
const FEATHER_SORT: SignatureMove = { name: { en: "Feather Sort!", ar: "فرز الريش!" }, skin: "feathers" };

const SIGNATURE_SKINS: Record<BossKey, Partial<Record<BattleInteractionType, SignatureMove>>> = {
  number_giant: { tap_to_count: DICE_ROLL, sequence_order: NUMBER_BOULDERS },
  letter_dragon: { sequence_order: JUMBLED_LETTERS, fill_missing_word: JUMBLED_LETTERS, match_pairs: SCROLL_SWAP },
  word_dragon: { fill_missing_word: WORD_PUFF, match_pairs: SCROLL_SWAP },
  letter_camel: { fill_missing_word: SAND_LETTERS, match_pairs: CARAVAN_MATCH },
  sprout_buddy: { sort_groups: GARDEN_BEDS, sequence_order: SEED_LINE },
  puzzle_owlet: { match_pairs: PUZZLE_PIECES, sort_groups: FEATHER_SORT },
};

/** The boss's signature move for this question, on block turns only. */
export function signatureFor(bossKey: BossKey, type: BattleInteractionType, turn: "attack" | "block"): SignatureMove | null {
  if (turn !== "block" || !BOSS_SIGNATURE_TYPES[bossKey].includes(type)) return null;
  return SIGNATURE_SKINS[bossKey][type] ?? null;
}

/** How each boss arrives in the arena. */
export type EntranceStyle = "stomp" | "fly" | "hop" | "roll";
export const BOSS_ENTRANCES: Record<BossKey, EntranceStyle> = {
  number_giant: "stomp",
  word_dragon: "fly",
  letter_dragon: "fly",
  letter_camel: "hop",
  sprout_buddy: "roll",
  puzzle_owlet: "fly",
};

/** One taunt line as the boss arrives (read aloud). */
export const BOSS_TAUNTS: Record<BossKey, { en: string; ar: string }> = {
  number_giant: { en: "I'm Numbo! Bet you can't beat my numbers!", ar: "أنا نُمبو! أراهن أنك لن تغلب أرقامي!" },
  word_dragon: { en: "I'm Wordy! My words are super tricky!", ar: "أنا وردي! كلماتي صعبة جداً!" },
  letter_dragon: { en: "I'm Harf! I'll jumble all your letters!", ar: "أنا حَرف! سأخلط كل حروفك!" },
  letter_camel: { en: "I'm Harfi! My letters will fool you!", ar: "أنا حَرفي! حروفي ستخدعك!" },
  sprout_buddy: { en: "I'm Sprouty! Watch my seeds fly!", ar: "أنا بُرعم! انظر إلى بذوري تطير!" },
  puzzle_owlet: { en: "Hoo hoo! My puzzles are the hardest!", ar: "هو هو! ألغازي هي الأصعب!" },
};
/** Boss Book: one fun line per boss, and the subject it guards. */
export const BOSS_FACTS: Record<BossKey, { en: string; ar: string }> = {
  number_giant: { en: "Numbo counts his toes every morning. He has 7. Or is it 8?", ar: "يعدّ نُمبو أصابع قدميه كل صباح. عنده ٧. أم ٨؟" },
  word_dragon: { en: "Wordy sneezes spelling words when he has a cold.", ar: "يعطس وردي كلمات إملائية عندما يُصاب بالزكام." },
  letter_dragon: { en: "Harf can write the whole alphabet with one flap of his wings.", ar: "يستطيع حَرف كتابة الحروف كلها برفرفة جناح واحدة." },
  letter_camel: { en: "Harfi keeps spare letters in his hump for long trips.", ar: "يخبّئ حَرفي حروفاً إضافية في سنامه للرحلات الطويلة." },
  sprout_buddy: { en: "Sprouty grows a new leaf every time you learn something.", ar: "تنمو لبُرعم ورقة جديدة كلما تعلّمت شيئاً." },
  puzzle_owlet: { en: "Puzzle Owlet once hid a puzzle inside another puzzle.", ar: "خبّأت البومة الصغيرة مرة لغزاً داخل لغز آخر." },
};

export const BOSS_SUBJECTS: Record<BossKey, { en: string; ar: string }> = {
  number_giant: { en: "Maths", ar: "الرياضيات" },
  word_dragon: { en: "English", ar: "الإنجليزية" },
  letter_dragon: { en: "Letters", ar: "الحروف" },
  letter_camel: { en: "Arabic", ar: "العربية" },
  sprout_buddy: { en: "Science", ar: "العلوم" },
  puzzle_owlet: { en: "Puzzles", ar: "الألغاز" },
};

export const REMATCH_TAUNT ={ en: "You again? I've been practising!", ar: "أنت مرة أخرى؟ لقد كنت أتدرّب!" };
export const RESUME_TAUNT = { en: "Back for more? Let's go!", ar: "عدت لتلعب؟ هيا بنا!" };

/** Class names a signature skin puts on the shared move parts. */
export interface SkinParts {
  /** Stones, pieces and tiles. */
  piece?: string;
  /** Empty slots / groups. */
  slot?: string;
  /** Filled slots. */
  slotFilled?: string;
  /** What gets thrown in a count move. */
  thrown?: "die" | "seed";
}

const DARK_TEXT = "text-[#1a1a1a] [text-shadow:none]";

export const SKIN_PARTS: Record<SkinKey, SkinParts> = {
  dice: { thrown: "die" },
  boulders: { piece: `rounded-full border-[3px] border-[#57391F] bg-[radial-gradient(circle_at_35%_30%,#B8865B,#7A5230)] text-white shadow-[0_6px_0_#3D2814] [text-shadow:0_2px_0_rgba(0,0,0,0.4)]` },
  letters: { piece: `rounded-[50%] border-[3px] border-[#F59E0B] bg-[radial-gradient(circle_at_35%_30%,#FFEDD5,#FB923C)] ${DARK_TEXT} shadow-[0_0_16px_rgba(251,146,60,0.8)]` },
  bubbles: { piece: `rounded-[50%] border-[3px] border-white/80 bg-[radial-gradient(circle_at_35%_30%,#FFFFFF,#7DD3FC)] ${DARK_TEXT} shadow-[0_0_14px_rgba(125,211,252,0.8)]` },
  scrolls: {
    slot: "rounded-[14px] border-4 border-dashed border-[#B45309] bg-[#FEF3C7]/90 text-[#78350F]",
    slotFilled: "rounded-[14px] border-4 border-[#B45309] bg-[#FEF3C7] text-[#78350F]",
  },
  sand: { piece: `border-[3px] border-[#B45309] bg-[#FCD9A0] ${DARK_TEXT} shadow-[0_5px_0_#B45309]` },
  saddlebags: {
    slot: "border-4 border-dashed border-[#FDE68A] bg-[repeating-linear-gradient(45deg,#D21034_0_10px,#B91C1C_10px_20px)] text-white",
    slotFilled: "border-4 border-[#FDE68A] bg-[repeating-linear-gradient(45deg,#D21034_0_10px,#B91C1C_10px_20px)] text-white",
  },
  beds: {
    slot: "border-4 border-dashed border-[#4ADE80] bg-[#5B3A1E]/90 text-white",
    slotFilled: "border-4 border-[#4ADE80] bg-[#5B3A1E] text-white",
  },
  seeds: { piece: "rounded-[50%_50%_45%_45%] border-[3px] border-[#7A4E22] bg-[radial-gradient(circle_at_35%_30%,#E8B880,#A86F37)] text-white shadow-[0_5px_0_#5B3A1E]" },
  puzzle: {
    slot: "border-4 border-dashed border-white/80 bg-[#2563EB]/80 text-white",
    slotFilled: "border-4 border-[#FDE68A] bg-[#2563EB] text-white",
  },
  feathers: {
    slot: "rounded-[60%_10%_60%_10%] border-4 border-dashed border-[#FDE68A] bg-[#D97706]/80 text-white",
    slotFilled: "rounded-[60%_10%_60%_10%] border-4 border-[#FDE68A] bg-[#D97706] text-white",
  },
};
