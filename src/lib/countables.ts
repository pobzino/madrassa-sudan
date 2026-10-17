/**
 * Things a child can count in a tap-to-count move: the keys, their names in
 * both languages, and the map from the emoji a model may write to those keys.
 * Pure data, shared by the server (prompts, stored items) and the icons.
 */
export const COUNTABLE_KEYS = [
  "star",
  "apple",
  "banana",
  "orange",
  "fish",
  "flower",
  "leaf",
  "balloon",
  "ball",
  "book",
  "pencil",
  "egg",
  "heart",
  "bird",
  "car",
  "cup",
  "sun",
  "moon",
  "candy",
  "butterfly",
  "tree",
] as const;
export type CountableKey = (typeof COUNTABLE_KEYS)[number];

const EMOJI_TO_KEY: Record<string, CountableKey> = {
  "⭐": "star", "🌟": "star", "✨": "star",
  "🍎": "apple", "🍏": "apple",
  "🍌": "banana",
  "🍊": "orange", "🍋": "orange",
  "🐟": "fish", "🐠": "fish",
  "🌸": "flower", "🌼": "flower", "🌺": "flower", "🌻": "flower", "🌷": "flower",
  "🍃": "leaf", "🌿": "leaf", "🍀": "leaf",
  "🎈": "balloon",
  "⚽": "ball", "🏀": "ball", "🎾": "ball",
  "📚": "book", "📖": "book", "📕": "book",
  "✏️": "pencil", "✏": "pencil", "🖍️": "pencil",
  "🥚": "egg",
  "❤️": "heart", "❤": "heart", "💛": "heart", "💚": "heart",
  "🐦": "bird", "🐤": "bird", "🐥": "bird",
  "🚗": "car", "🚕": "car",
  "☕": "cup", "🥛": "cup",
  "☀️": "sun", "☀": "sun",
  "🌙": "moon",
  "🍬": "candy", "🍭": "candy",
  "🦋": "butterfly",
  "🌳": "tree", "🌲": "tree", "🌴": "tree",
};

export function isCountableKey(value: string): value is CountableKey {
  return (COUNTABLE_KEYS as readonly string[]).includes(value);
}

/** The icon key for a generated "emoji" (or a key): known emoji map across, anything else is a star. */
export function countableFor(value: string | null | undefined): CountableKey {
  const v = (value ?? "").trim();
  if (!v) return "star";
  if (isCountableKey(v)) return v;
  return EMOJI_TO_KEY[v] ?? EMOJI_TO_KEY[v.replace(/️/g, "")] ?? "star";
}

/** What to call it, for labels ("Count 5 apples"). */
export const COUNTABLE_NAMES: Record<CountableKey, { en: [string, string]; ar: string }> = {
  star: { en: ["star", "stars"], ar: "نجوم" },
  apple: { en: ["apple", "apples"], ar: "تفاحات" },
  banana: { en: ["banana", "bananas"], ar: "موزات" },
  orange: { en: ["orange", "oranges"], ar: "برتقالات" },
  fish: { en: ["fish", "fish"], ar: "أسماك" },
  flower: { en: ["flower", "flowers"], ar: "زهور" },
  leaf: { en: ["leaf", "leaves"], ar: "أوراق" },
  balloon: { en: ["balloon", "balloons"], ar: "بالونات" },
  ball: { en: ["ball", "balls"], ar: "كرات" },
  book: { en: ["book", "books"], ar: "كتب" },
  pencil: { en: ["pencil", "pencils"], ar: "أقلام" },
  egg: { en: ["egg", "eggs"], ar: "بيضات" },
  heart: { en: ["heart", "hearts"], ar: "قلوب" },
  bird: { en: ["bird", "birds"], ar: "عصافير" },
  car: { en: ["car", "cars"], ar: "سيارات" },
  cup: { en: ["cup", "cups"], ar: "أكواب" },
  sun: { en: ["sun", "suns"], ar: "شموس" },
  moon: { en: ["moon", "moons"], ar: "أقمار" },
  candy: { en: ["sweet", "sweets"], ar: "حلويات" },
  butterfly: { en: ["butterfly", "butterflies"], ar: "فراشات" },
  tree: { en: ["tree", "trees"], ar: "أشجار" },
};

