import type { BossKey } from "@/lib/milestones/types";

/**
 * What each boss says during a battle, in both languages: calm lines while it
 * is winning, bigger talk once it is "powered" (two thirds down), silly bluster
 * when "enraged" (one third left), and one-off reactions. Lines are short,
 * cheeky and kind: a boss is a friend being won over, never a threat.
 *
 * Every line is also recorded once with ElevenLabs (scripts/voice-boss-lines.ts)
 * to public/audio/boss/<boss>/<lang>/<kind>-<n>.mp3; `bossLineUrl` points at it,
 * and the battle falls back to the phone's own voice if the file is missing.
 */
export type BossLineKind =
  | "entrance"
  | "rematch"
  | "resume"
  | "calm"
  | "powered"
  | "enraged"
  | "streak"
  | "stumble"
  | "hint"
  | "bigMove"
  | "bigMoveLanded"
  | "bigMoveCountered"
  | "ko"
  | "victory";

export type BossLine = { en: string; ar: string };
export type BossLineSet = Record<BossLineKind, readonly BossLine[]>;

const l = (en: string, ar: string): BossLine => ({ en, ar });

export const BOSS_LINES: Record<BossKey, BossLineSet> = {
  number_giant: {
    entrance: [l("I'm Numbo! Bet you can't beat my numbers!", "أنا نُمبو! أراهن أنك لن تغلب أرقامي!")],
    rematch: [l("You again? I've been practising!", "أنت مرة أخرى؟ لقد كنت أتدرّب!")],
    resume: [l("Back for more? Let's go!", "عدت لتلعب؟ هيا بنا!")],
    calm: [
      l("Numbers are MY thing. Watch out!", "الأرقام لعبتي أنا! انتبه!"),
      l("One, two, three... I count faster than you!", "واحد، اثنان، ثلاثة... أنا أعدّ أسرع منك!"),
      l("Ha! I have a hundred tricks. Or ten. Or... a lot!", "ها! عندي مئة حيلة. أو عشر. أو... كثير!"),
      l("Try THIS one, little owl!", "جرّب هذا يا بومة صغيرة!"),
      l("My toes are counting on me!", "أصابع قدمي تعتمد عليّ!"),
      l("Too easy for Numbo. Maybe not for you!", "سهل جداً على نُمبو. ربما ليس عليك!"),
    ],
    powered: [
      l("Ooh, you're good. Time for BIG numbers!", "أوه، أنت ماهر. حان وقت الأرقام الكبيرة!"),
      l("Numbo gets stronger! Count on it!", "نُمبو يزداد قوة! اعتمد على ذلك!"),
      l("Stomp stomp! Here come the tough ones!", "دُم دُم! ها هي الأسئلة الصعبة!"),
      l("I'm adding up ALL my power now!", "أجمع كل قوتي الآن!"),
    ],
    enraged: [
      l("No fair! You're counting too well!", "هذا ليس عدلاً! أنت تعدّ جيداً جداً!"),
      l("Grrr! I'll miscount you... I mean, outcount you!", "غرر! سأعدّ عليك... أعني سأتفوّق عليك!"),
      l("Numbo is WOBBLING! Not for long!", "نُمبو يترنّح! ليس لوقت طويل!"),
      l("Last numbers! Don't you dare get them right!", "آخر الأرقام! إيّاك أن تصيب!"),
    ],
    streak: [
      l("Three in a row? Who taught you that?!", "ثلاثة متتالية؟ من علّمك هذا؟!"),
      l("Stop being so clever for ONE second!", "توقف عن الذكاء ولو لثانية واحدة!"),
    ],
    stumble: [
      l("Ha ha! Numbo wins that one!", "ها ها! نُمبو فاز بهذه!"),
      l("Oops! Count again next time!", "أوبس! عدّ من جديد في المرة القادمة!"),
      l("Gotcha! My numbers are sneaky.", "أمسكتك! أرقامي ماكرة."),
    ],
    hint: [l("Hey! No help from the owl!", "هيه! ممنوع مساعدة البومة!")],
    bigMove: [
      l("Here comes my BIGGEST number!", "ها هو رقمي الأكبر!"),
      l("Stand back! Number AVALANCHE!", "ابتعد! انهيار الأرقام!"),
    ],
    bigMoveLanded: [l("BOOM! Too slow, little owl!", "بووم! بطيء جداً يا بومة!")],
    bigMoveCountered: [l("WHAT?! You bounced it right back!", "ماذا؟! أعدتها إليّ مباشرة!")],
    ko: [l("Okay, okay... you win. You're really good at numbers!", "حسناً حسناً... فزت. أنت ماهر جداً في الأرقام!")],
    victory: [l("Phew! Close one. Practise and come back, friend!", "أوف! كانت قريبة. تدرّب وعُد يا صديقي!")],
  },
  word_dragon: {
    entrance: [l("I'm Wordy! My words are super tricky!", "أنا وردي! كلماتي صعبة جداً!")],
    rematch: [l("You again? I've been practising!", "أنت مرة أخرى؟ لقد كنت أتدرّب!")],
    resume: [l("Back for more? Let's go!", "عدت لتلعب؟ هيا بنا!")],
    calm: [
      l("My words are twisty and tricky!", "كلماتي ملتوية وصعبة!"),
      l("Achoo! Oops, I sneezed a spelling word.", "هاتشو! أوبس، عطست كلمة إملائية."),
      l("Can you read THIS one, little owl?", "هل تستطيع قراءة هذه يا بومة صغيرة؟"),
      l("Wordy knows ALL the words. Nearly.", "وردي يعرف كل الكلمات. تقريباً."),
      l("Letters go in, puzzles come out!", "تدخل الحروف، وتخرج الألغاز!"),
      l("Ready? Set? Spell!", "مستعد؟ استعد؟ تهجَّ!"),
    ],
    powered: [
      l("Ooh, clever! Now for the LONG words!", "أوه، ذكي! الآن الكلمات الطويلة!"),
      l("My wings are flapping with word power!", "أجنحتي ترفرف بقوة الكلمات!"),
      l("Achoo! That was a tough one coming!", "هاتشو! جاءت كلمة صعبة!"),
      l("Wordy is warming up. Hot words ahead!", "وردي يتحمّس. كلمات ساخنة قادمة!"),
    ],
    enraged: [
      l("Nooo! You read too well!", "لااا! أنت تقرأ جيداً جداً!"),
      l("Grrr-choo! I'm running out of tricky words!", "غرر-تشو! كلماتي الصعبة تنفد!"),
      l("Wordy is dizzy with words!", "وردي يدور من الكلمات!"),
      l("Last letters! Don't spell them right!", "آخر الحروف! لا تتهجَّها صحيحاً!"),
    ],
    streak: [
      l("Three right?! Did you swallow a dictionary?", "ثلاث إجابات صحيحة؟! هل ابتلعت قاموساً؟"),
      l("Stop reading so fast!", "توقف عن القراءة بهذه السرعة!"),
    ],
    stumble: [
      l("Ha! That word fooled you!", "ها! تلك الكلمة خدعتك!"),
      l("Tricky, right? Try again next time!", "صعبة، أليس كذلك؟ حاول في المرة القادمة!"),
      l("Wordy wins that round!", "وردي فاز بهذه الجولة!"),
    ],
    hint: [l("No whispering, owl!", "لا همس يا بومة!")],
    bigMove: [
      l("Here comes my LONGEST word!", "ها هي أطول كلماتي!"),
      l("Giant word puff, coming up!", "نفخة كلمات عملاقة قادمة!"),
    ],
    bigMoveLanded: [l("Puff! Too slow, little owl!", "پف! بطيء جداً يا بومة!")],
    bigMoveCountered: [l("You read my big word?! Achoo!", "قرأت كلمتي الكبيرة؟! هاتشو!")],
    ko: [l("Okay, you win! You're a real word wizard.", "حسناً، فزت! أنت ساحر كلمات حقيقي."),],
    victory: [l("Phew! Nearly. Practise and come back, friend!", "أوف! كدت تفوز. تدرّب وعُد يا صديقي!")],
  },
  letter_dragon: {
    entrance: [l("I'm Harf! I'll jumble all your letters!", "أنا حَرف! سأخلط كل حروفك!")],
    rematch: [l("You again? I've been practising!", "أنت مرة أخرى؟ لقد كنت أتدرّب!")],
    resume: [l("Back for more? Let's go!", "عدت لتلعب؟ هيا بنا!")],
    calm: [
      l("I'll jumble all your letters!", "سأخلط كل حروفك!"),
      l("Alif, baa, taa... can you keep up?", "ألف، باء، تاء... هل تستطيع مجاراتي؟"),
      l("Harf flies, letters fly! Catch them!", "حَرف يطير، والحروف تطير! أمسك بها!"),
      l("One flap and the letters are everywhere!", "رفرفة واحدة والحروف في كل مكان!"),
      l("Which letter is it? Think fast!", "أي حرف هذا؟ فكّر بسرعة!"),
      l("Dragon letters are the trickiest!", "حروف التنين هي الأصعب!"),
    ],
    powered: [
      l("Impressive! Now the letters get fiery!", "مذهل! الآن الحروف تشتعل!"),
      l("Harf's wings are glowing. Big letters ahead!", "أجنحة حَرف تتوهّج. حروف كبيرة قادمة!"),
      l("You know your letters. But do you know THESE?", "تعرف حروفك. لكن هل تعرف هذه؟"),
      l("Whoosh! Harder letters incoming!", "ووش! حروف أصعب قادمة!"),
    ],
    enraged: [
      l("No! You're too good at letters!", "لا! أنت ماهر جداً في الحروف!"),
      l("Grrr! My letters won't jumble!", "غرر! حروفي لا تختلط!"),
      l("Harf is dizzy! Flapping too fast!", "حَرف يدور! رفرف بسرعة كبيرة!"),
      l("Last letters! Please get them wrong!", "آخر الحروف! أرجوك أخطئ فيها!"),
    ],
    streak: [
      l("Three in a row?! Are you a dragon too?", "ثلاثة متتالية؟! هل أنت تنين أيضاً؟"),
      l("Slow down, letter master!", "تمهّل يا سيد الحروف!"),
    ],
    stumble: [
      l("Ha! That letter tricked you!", "ها! ذلك الحرف خدعك!"),
      l("Jumbled you! Try again!", "خلطتك! حاول مجدداً!"),
      l("Harf wins that one!", "حَرف فاز بهذه!"),
    ],
    hint: [l("Owl! No helping!", "يا بومة! لا مساعدة!")],
    bigMove: [
      l("Here comes my LETTER STORM!", "ها هي عاصفة الحروف!"),
      l("Dragon fire spelling, coming up!", "تهجئة نار التنين قادمة!"),
    ],
    bigMoveLanded: [l("Whoosh! Too slow, little owl!", "ووش! بطيء جداً يا بومة!")],
    bigMoveCountered: [l("You caught every letter?! Wow!", "أمسكت كل الحروف؟! رائع!")],
    ko: [l("Okay, you win! You're a letter champion.", "حسناً، فزت! أنت بطل الحروف.")],
    victory: [l("Phew! So close. Practise and come back, friend!", "أوف! كانت قريبة. تدرّب وعُد يا صديقي!")],
  },
  letter_camel: {
    entrance: [l("I'm Harfi! My letters will fool you!", "أنا حَرفي! حروفي ستخدعك!")],
    rematch: [l("You again? I've been practising!", "أنت مرة أخرى؟ لقد كنت أتدرّب!")],
    resume: [l("Back for more? Let's go!", "عدت لتلعب؟ هيا بنا!")],
    calm: [
      l("Desert letters are hot and tricky!", "حروف الصحراء حارّة وصعبة!"),
      l("I keep spare letters in my hump. Lots!", "أخبّئ حروفاً إضافية في سنامي. كثيرة!"),
      l("Slow and steady... and sneaky!", "ببطء وثبات... وبمكر!"),
      l("Can you read letters in the sand?", "هل تستطيع قراءة الحروف في الرمل؟"),
      l("Harfi never forgets a letter. Do you?", "حَرفي لا ينسى حرفاً أبداً. وأنت؟"),
      l("The caravan is waiting. Answer up!", "القافلة تنتظر. أجب!"),
    ],
    powered: [
      l("Ooh, clever! The sand is heating up!", "أوه، ذكي! الرمل يسخن!"),
      l("Harfi stands tall now. Tough letters ahead!", "حَرفي يقف شامخاً الآن. حروف صعبة قادمة!"),
      l("Hump power! Here come the big ones!", "قوة السنام! ها هي الحروف الكبيرة!"),
      l("You're fast for a desert day!", "أنت سريع ليوم صحراوي!"),
    ],
    enraged: [
      l("No! You read sand letters too well!", "لا! تقرأ حروف الرمل جيداً جداً!"),
      l("Grrr! My hump is running out of letters!", "غرر! حروف سنامي تنفد!"),
      l("Harfi is wobbling in the sand!", "حَرفي يترنّح في الرمل!"),
      l("Last letters! Get them wrong, please!", "آخر الحروف! أخطئ فيها، أرجوك!"),
    ],
    streak: [
      l("Three right?! Did you drink all the water?", "ثلاث صحيحة؟! هل شربت كل الماء؟"),
      l("Slow down, little scholar!", "تمهّل يا عالِم صغير!"),
    ],
    stumble: [
      l("Ha! The sand got you!", "ها! الرمل أمسكك!"),
      l("Tricky letter! Try again!", "حرف صعب! حاول مجدداً!"),
      l("Harfi wins that one!", "حَرفي فاز بهذه!"),
    ],
    hint: [l("No help, owl! Desert rules!", "لا مساعدة يا بومة! قوانين الصحراء!")],
    bigMove: [
      l("Here comes my SANDSTORM!", "ها هي عاصفتي الرملية!"),
      l("Caravan of letters, charge!", "قافلة الحروف، انطلقي!"),
    ],
    bigMoveLanded: [l("Whoosh! Buried you, little owl!", "ووش! دفنتك يا بومة!")],
    bigMoveCountered: [l("You read through the sandstorm?! Amazing!", "قرأت عبر العاصفة؟! مذهل!")],
    ko: [l("Okay, you win! You're a true desert reader.", "حسناً، فزت! أنت قارئ صحراء حقيقي.")],
    victory: [l("Phew! Nearly. Practise and come back, friend!", "أوف! كدت تفوز. تدرّب وعُد يا صديقي!")],
  },
  sprout_buddy: {
    entrance: [l("I'm Sprouty! Watch my seeds fly!", "أنا بُرعم! انظر إلى بذوري تطير!")],
    rematch: [l("You again? I've been practising!", "أنت مرة أخرى؟ لقد كنت أتدرّب!")],
    resume: [l("Back for more? Let's go!", "عدت لتلعب؟ هيا بنا!")],
    calm: [
      l("My puzzles grow like weeds!", "ألغازي تنمو كالأعشاب!"),
      l("Sprouty is sprouting a new question!", "بُرعم ينبت سؤالاً جديداً!"),
      l("Water, sun, and tricky questions!", "ماء وشمس وأسئلة صعبة!"),
      l("Can you dig up the answer?", "هل تستطيع حفر الإجابة؟"),
      l("Leaf it to me. Get it? Leaf!", "اتركها لي. فهمتها؟ ورقة!"),
      l("Grow, little question, grow!", "انمُ يا سؤالي الصغير، انمُ!"),
    ],
    powered: [
      l("Ooh! You're blooming! Time for thorny ones!", "أوه! أنت تتفتّح! حان وقت الأسئلة الشائكة!"),
      l("Sprouty is growing taller. Big questions!", "بُرعم ينمو أطول. أسئلة كبيرة!"),
      l("Roots down, power up!", "الجذور للأسفل، والقوة للأعلى!"),
      l("Here come the deep-soil questions!", "ها هي أسئلة التربة العميقة!"),
    ],
    enraged: [
      l("No! You're growing too fast!", "لا! أنت تنمو بسرعة كبيرة!"),
      l("Grrr! My leaves are wobbling!", "غرر! أوراقي تهتز!"),
      l("Sprouty is dizzy! Too much sun!", "بُرعم يدور! شمس كثيرة!"),
      l("Last seeds! Don't get them right!", "آخر البذور! لا تصب فيها!"),
    ],
    streak: [
      l("Three in a row?! You're a super gardener!", "ثلاثة متتالية؟! أنت بستاني خارق!"),
      l("Stop blooming so fast!", "توقف عن التفتّح بهذه السرعة!"),
    ],
    stumble: [
      l("Ha! That one was thorny!", "ها! كانت تلك شائكة!"),
      l("Oops! Plant that answer again!", "أوبس! ازرع تلك الإجابة من جديد!"),
      l("Sprouty wins that one!", "بُرعم فاز بهذه!"),
    ],
    hint: [l("No help, owl! Grow it yourself!", "لا مساعدة يا بومة! انمُ بنفسك!")],
    bigMove: [
      l("Here comes my GIANT BEANSTALK!", "ها هي ساق الفاصولياء العملاقة!"),
      l("Seed storm, coming up!", "عاصفة بذور قادمة!"),
    ],
    bigMoveLanded: [l("Sprouted all over you! Too slow!", "نبتُّ فوقك كلّك! بطيء جداً!")],
    bigMoveCountered: [l("You pruned my big move?! Wow!", "قلّمت حركتي الكبيرة؟! رائع!")],
    ko: [l("Okay, you win! You helped me grow!", "حسناً، فزت! ساعدتني على النمو!")],
    victory: [l("Phew! So close. Practise and come back, friend!", "أوف! كانت قريبة. تدرّب وعُد يا صديقي!")],
  },
  puzzle_owlet: {
    entrance: [l("Hoo hoo! My puzzles are the hardest!", "هو هو! ألغازي هي الأصعب!")],
    rematch: [l("You again? I've been practising!", "أنت مرة أخرى؟ لقد كنت أتدرّب!")],
    resume: [l("Back for more? Let's go!", "عدت لتلعب؟ هيا بنا!")],
    calm: [
      l("Hoo hoo! My puzzles are the hardest!", "هو هو! ألغازي هي الأصعب!"),
      l("A puzzle inside a puzzle. Hoo!", "لغز داخل لغز. هو!"),
      l("Can you crack this one, big owl?", "هل تستطيع حلّ هذا يا بومة كبيرة؟"),
      l("Think, think, think!", "فكّر، فكّر، فكّر!"),
      l("Every piece has a place. Find it!", "لكل قطعة مكان. جِده!"),
      l("Hoo hoo! Tricky, tricky!", "هو هو! صعب، صعب!"),
    ],
    powered: [
      l("Ooh, smart! Now the REAL puzzles!", "أوه، ذكي! الآن الألغاز الحقيقية!"),
      l("Feathers up! Harder pieces ahead!", "ريش للأعلى! قطع أصعب قادمة!"),
      l("Hoo! You woke up my brain!", "هو! أيقظت عقلي!"),
      l("Puzzle power rising!", "قوة الألغاز ترتفع!"),
    ],
    enraged: [
      l("No! You solve too fast!", "لا! تحلّ بسرعة كبيرة!"),
      l("Hoo-grr! My pieces are falling apart!", "هو-غرر! قطعي تتفكّك!"),
      l("Owlet is dizzy! Too many puzzles!", "البومة الصغيرة تدور! ألغاز كثيرة!"),
      l("Last pieces! Don't fit them!", "آخر القطع! لا تركّبها!"),
    ],
    streak: [
      l("Three in a row?! Who's the puzzle owl now?!", "ثلاثة متتالية؟! من بومة الألغاز الآن؟!"),
      l("Hoo! Slow down, genius!", "هو! تمهّل أيها العبقري!"),
    ],
    stumble: [
      l("Hoo hoo! Fooled you!", "هو هو! خدعتك!"),
      l("That piece didn't fit! Try again!", "تلك القطعة لم تناسب! حاول مجدداً!"),
      l("Owlet wins that one!", "البومة الصغيرة فازت بهذه!"),
    ],
    hint: [l("Hoo! No helping, big owl!", "هو! لا مساعدة يا بومة كبيرة!")],
    bigMove: [
      l("Here comes my GIANT PUZZLE!", "ها هو لغزي العملاق!"),
      l("Thousand-piece storm, coming up!", "عاصفة الألف قطعة قادمة!"),
    ],
    bigMoveLanded: [l("Hoo hoo! Too slow, big owl!", "هو هو! بطيء جداً يا بومة كبيرة!")],
    bigMoveCountered: [l("You solved my giant puzzle?! Hoo!", "حللت لغزي العملاق؟! هو!")],
    ko: [l("Okay, you win! You're the cleverest owl!", "حسناً، فزت! أنت أذكى بومة!")],
    victory: [l("Hoo! Nearly. Practise and come back, friend!", "هو! كدت تفوز. تدرّب وعُد يا صديقي!")],
  },
};

export const BOSS_LINE_KINDS = Object.keys(BOSS_LINES.number_giant) as BossLineKind[];

/** Where a line's recording lives (see scripts/voice-boss-lines.ts). */
export function bossLineUrl(bossKey: BossKey, lang: "ar" | "en", kind: BossLineKind, index: number) {
  return `/audio/boss/${bossKey}/${lang}/${kind}-${index}.mp3`;
}

/**
 * Picks lines for one battle without repeating until a kind is used up, in a
 * shuffled order seeded by the battle id so a resume says the same things.
 */
export class BossLinePicker {
  private readonly order = new Map<BossLineKind, number[]>();
  private readonly used = new Map<BossLineKind, number>();

  constructor(private readonly bossKey: BossKey, seed: string) {
    let h = 2166136261;
    for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
    const random = () => {
      h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
      return h / 4294967296;
    };
    for (const kind of BOSS_LINE_KINDS) {
      const indexes = BOSS_LINES[bossKey][kind].map((_, i) => i);
      for (let i = indexes.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
      }
      this.order.set(kind, indexes);
    }
  }

  next(kind: BossLineKind, lang: "ar" | "en"): { text: string; url: string } {
    const indexes = this.order.get(kind) ?? [0];
    const n = this.used.get(kind) ?? 0;
    const index = indexes[n % indexes.length];
    this.used.set(kind, n + 1);
    return { text: BOSS_LINES[this.bossKey][kind][index][lang], url: bossLineUrl(this.bossKey, lang, kind, index) };
  }
}
