import type { LevelBand } from "@/lib/measurement/types";
import { renderEmail, type EmailContent, type EmailLanguage, type RenderedEmail, type RenderOptions } from "./render";

type Base = { language: EmailLanguage; name: string | null } & RenderOptions;

function firstName(name: string | null) {
  return name?.trim().split(/\s+/)[0] || null;
}

function formatNumber(language: EmailLanguage, value: number) {
  return new Intl.NumberFormat(language === "ar" ? "ar-EG" : "en-GB").format(value);
}

function render(subject: string, content: EmailContent, { siteUrl, assetUrl }: RenderOptions) {
  return renderEmail(subject, content, { siteUrl, assetUrl });
}

export function welcomeParentEmail(args: Base & { whatsappGroupUrl: string }): RenderedEmail {
  const { language, name, siteUrl, whatsappGroupUrl } = args;
  const first = firstName(name);
  if (language === "ar") {
    return render(
      "أهلاً بكم في مدرسة آمال",
      {
        language,
        preheader: "حسابكم جاهز، والدرس الأول بانتظاركم.",
        hero: { art: "welcome", alt: "بومة آمال تلوّح بجناحها" },
        heading: first ? `أهلاً بكم في عائلة آمال يا ${first}!` : "أهلاً بكم في عائلة آمال!",
        paragraphs: ["حسابكم جاهز. كل الدروس في آمال مجانية، يسجّلها معلّمون متطوعون، ومصمّمة للتعلّم في البيت."],
        steps: [
          "اختر الرياضيات أو اللغة الإنجليزية من مسار التعلّم.",
          "شاهدوا الدرس معاً، والمعلّم يشرح خطوة بخطوة.",
          "جرّب أسئلة التدريب. احصل على ٧٥٪ لإكمال الدرس، وأعد المحاولة كما تشاء.",
        ],
        cta: { label: "ابدأ الدرس الأول", url: `${siteUrl}/dashboard` },
        callout: {
          text: "عندك سؤال، أو تحب تتعرّف على عائلات أخرى؟ انضم إلى مجموعة الأهالي على واتساب.",
          link: { label: "انضم إلى المجموعة", url: whatsappGroupUrl },
        },
        secondaryLink: { label: "أضف آمال إلى الشاشة الرئيسية لهاتفك", url: `${siteUrl}/app?lang=ar` },
      },
      args,
    );
  }
  return render(
    "Welcome to Amal School",
    {
      language,
      preheader: "Your account is ready, and your first lesson is waiting.",
      hero: { art: "welcome", alt: "The Amal owl waving hello" },
      heading: first ? `Welcome to the family, ${first}!` : "Welcome to the family!",
      paragraphs: ["Your account is ready. Every lesson on Amal is free, recorded by volunteer teachers, and made for learning at home."],
      steps: [
        "Pick Maths or English on your learning path.",
        "Watch the lesson together while your teacher explains, step by step.",
        "Try the Practice questions. Score 75% to finish the lesson, and retry as often as you like.",
      ],
      cta: { label: "Start your first lesson", url: `${siteUrl}/dashboard` },
      callout: {
        text: "Got a question, or want to meet other families? Join our parents' WhatsApp group.",
        link: { label: "Join the group", url: whatsappGroupUrl },
      },
      secondaryLink: { label: "Add Amal to your phone's home screen", url: `${siteUrl}/app?lang=en` },
    },
    args,
  );
}

export function welcomeTeacherEmail(args: Base): RenderedEmail {
  const { language, name, siteUrl } = args;
  const first = firstName(name);
  if (language === "ar") {
    return render(
      "أهلاً بك في فريق معلّمي آمال",
      {
        language,
        preheader: "تمت الموافقة على حسابك. إليك طريقة تسجيل درسك الأول.",
        hero: { art: "teacher", alt: "بومة آمال بجانب سبّورة" },
        heading: first ? `أهلاً بك في الفريق يا ${first}!` : "أهلاً بك في الفريق!",
        paragraphs: [
          "شكراً لتطوعك. مهمتك بسيطة: سجّل الدروس بصوتك، ويتعلّم منها الأطفال بالسرعة التي تناسبهم أينما كانوا. لا فصول تديرها ولا واجبات تصحّحها.",
        ],
        steps: ["اقرأ دليل التسجيل القصير.", "سجّل درسك الأول من لوحة المعلّم.", "سنرسل لك كل شهر عدد الأطفال الذين وصلتهم دروسك."],
        cta: { label: "سجّل درسي الأول", url: `${siteUrl}/teacher/lessons/new` },
        secondaryLink: { label: "اقرأ دليل التسجيل", url: `${siteUrl}/tutor-guide.md` },
      },
      args,
    );
  }
  return render(
    "Welcome to the Amal teaching team",
    {
      language,
      preheader: "You're approved. Here's how to record your first lesson.",
      hero: { art: "teacher", alt: "The Amal owl beside a chalkboard" },
      heading: first ? `You're in, ${first}!` : "You're in!",
      paragraphs: [
        "Thank you for volunteering. Your part is simple: record lessons in your own voice, and children learn from them at their own pace, wherever they are. No classes to run, no marking.",
      ],
      steps: [
        "Read the short recording guide.",
        "Record your first lesson from your teacher dashboard.",
        "Each month, we'll email you how many children your lessons reached.",
      ],
      cta: { label: "Record my first lesson", url: `${siteUrl}/teacher/lessons/new` },
      secondaryLink: { label: "Read the recording guide", url: `${siteUrl}/tutor-guide.md` },
    },
    args,
  );
}

export type WeeklySummary = {
  lessonsStarted: number;
  lessonsCompleted: number;
  practiceTried: number;
  practicePassed: number;
  streakDays: number;
  /** Seven entries, Sunday to Saturday: whether there was any learning that day. */
  activeDays: boolean[];
};

/** Skills from the learning-measurement summary (only when MEASUREMENT_DIGEST_ENABLED): names and bands, never scores. */
export type ChildSkillsDigest = {
  learned: Array<{ skillKey: string; familyLabelEn: string; familyLabelAr: string }>;
  growth: Array<{ subjectNameEn: string | null; subjectNameAr: string | null; from: LevelBand; to: LevelBand }>;
};
export type ChildWeeklySummary = { name: string; summary: WeeklySummary; skills?: ChildSkillsDigest };

/** Level band words for families (mirrored in the app copy). */
export const LEVEL_BAND_LABELS: Record<EmailLanguage, Record<LevelBand, string>> = {
  en: { getting_started: "Getting started", on_the_way: "On the way", confident: "Confident" },
  ar: { getting_started: "في البداية", on_the_way: "في الطريق", confident: "واثق" },
};

/** At most 3 skill names, then "+N more" (Arabic digits in Arabic). */
export function skillsLearnedLine(language: EmailLanguage, labels: readonly string[]): string | null {
  if (!labels.length) return null;
  const shown = labels.slice(0, 3);
  const extra = labels.length - shown.length;
  if (language === "ar") {
    return `مهارات تعلّمها هذا الشهر: ${shown.join("، ")}${extra > 0 ? ` (+${formatNumber("ar", extra)} أخرى)` : ""}`;
  }
  return `Skills learned this month: ${shown.join(", ")}${extra > 0 ? ` (+${extra} more)` : ""}`;
}

/** "Since starting: Maths — Getting started → On the way". */
export function growthLine(language: EmailLanguage, growth: ChildSkillsDigest["growth"]): string | null {
  if (!growth.length) return null;
  const labels = LEVEL_BAND_LABELS[language];
  const parts = growth.map((row) => {
    const subject = (language === "ar" ? row.subjectNameAr || row.subjectNameEn : row.subjectNameEn || row.subjectNameAr) || "";
    return language === "ar" ? `${subject} — ${labels[row.from]} ← ${labels[row.to]}` : `${subject} — ${labels[row.from]} → ${labels[row.to]}`;
  });
  return language === "ar" ? `منذ البداية: ${parts.join("، ")}` : `Since starting: ${parts.join(", ")}`;
}

function childSkillLines(language: EmailLanguage, child: ChildWeeklySummary): string[] {
  if (!child.skills) return [];
  const learned = skillsLearnedLine(language, child.skills.learned.map((chip) => (language === "ar" ? chip.familyLabelAr : chip.familyLabelEn)));
  const growth = growthLine(language, child.skills.growth);
  return [learned, growth].filter((line): line is string => Boolean(line)).map((line) => `${child.name}: ${line}`);
}

export function hadActivity(summary: WeeklySummary) {
  return summary.lessonsStarted + summary.lessonsCompleted + summary.practiceTried > 0 || summary.activeDays.some(Boolean);
}

const DAY_LABELS = {
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  ar: ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"],
};

export function weeklyProgressEmail(
  args: Base & { unsubscribeUrl: string; summary: WeeklySummary; childSummaries?: ChildWeeklySummary[]; /** e.g. "12–18 October" */ weekLabel: string },
): RenderedEmail {
  const { language, name, siteUrl, unsubscribeUrl, summary, childSummaries = [], weekLabel } = args;
  const first = firstName(name);
  const n = (value: number) => formatNumber(language, value);
  const daysLearned = summary.activeDays.filter(Boolean).length;
  const week = (title: string) => ({
    title,
    days: DAY_LABELS[language].map((label, i) => ({ label, active: Boolean(summary.activeDays[i]) })),
  });
  const childLines = childSummaries.filter((child) => hadActivity(child.summary)).map(({ name: childName, summary: child }) => {
    const activity = language === "ar"
      ? `${n(child.lessonsStarted)} دروس بدأت، ${n(child.lessonsCompleted)} دروس مكتملة، ${n(child.practicePassed)} تدريبات ناجحة`
      : `${n(child.lessonsStarted)} ${child.lessonsStarted === 1 ? "lesson" : "lessons"} started, ${n(child.lessonsCompleted)} completed, ${n(child.practicePassed)} Practice ${child.practicePassed === 1 ? "set" : "sets"} passed`;
    return `${childName}: ${activity}`;
  });
  // Learning-measurement lines (flag on only): under the activity lines, for children with data.
  childLines.push(...childSummaries.flatMap((child) => childSkillLines(language, child)));

  if (language === "ar") {
    const footer = {
      footerNote: "يصلك هذا الملخص كل يوم أحد لأن عائلتك تتعلّم في مدرسة آمال.",
      unsubscribe: { label: "إيقاف الملخص الأسبوعي", url: unsubscribeUrl },
    };
    if (!hadActivity(summary)) {
      return render(
        "درسك التالي بانتظارك",
        {
          language,
          preheader: "حتى عشر دقائق اليوم تُحدث فرقاً.",
          hero: { art: "missed", alt: "بومة آمال تقرأ كتاباً" },
          heading: first ? `اشتقنا إليكم هذا الأسبوع يا ${first}` : "اشتقنا إليكم هذا الأسبوع",
          paragraphs: ["درسك التالي جاهز متى شئت. حتى عشر دقائق اليوم تحافظ على استمرار التعلّم."],
          cta: { label: "افتح درسي التالي", url: `${siteUrl}/dashboard` },
          ...footer,
        },
        args,
      );
    }
    return render(
      summary.lessonsCompleted ? `أسبوعكم في آمال: ${n(summary.lessonsCompleted)} دروس مكتملة` : "أسبوعكم في آمال",
      {
        language,
        preheader: `تقرير عائلتكم لأسبوع ${weekLabel}.`,
        hero: { art: "celebrate", alt: "بومة آمال ترقص فرحاً" },
        heading: first ? `يا له من أسبوع يا ${first}!` : "يا له من أسبوع!",
        paragraphs: [`هذا تقرير عائلتكم لأسبوع ${weekLabel}.`, ...childLines],
        board: {
          title: "هذا الأسبوع",
          stats: [
            { value: n(summary.lessonsCompleted), label: "دروس مكتملة" },
            ...(summary.practiceTried ? [{ value: `${n(summary.practicePassed)}/${n(summary.practiceTried)}`, label: "تدريبات ناجحة" }] : []),
            { value: `${n(daysLearned)}/${n(7)}`, label: "أيام تعلّم" },
          ],
        },
        week: week("الأيام التي تعلّمتم فيها"),
        closingParagraphs: [
          summary.streakDays > 1
            ? `أنتم على سلسلة من ${n(summary.streakDays)} أيام متتالية. واصلوا غداً!`
            : "القليل كل يوم يصنع فرقاً كبيراً. نراكم غداً!",
        ],
        cta: { label: "واصل التعلّم", url: `${siteUrl}/dashboard` },
        secondaryLink: { label: "شاهد التقدّم كاملاً", url: `${siteUrl}/progress` },
        ...footer,
      },
      args,
    );
  }

  const footer = {
    footerNote: "You get this summary each Sunday because your family learns on Amal School.",
    unsubscribe: { label: "Stop weekly summaries", url: unsubscribeUrl },
  };
  if (!hadActivity(summary)) {
    return render(
      "Your next lesson is waiting",
      {
        language,
        preheader: "Even ten minutes today makes a difference.",
        hero: { art: "missed", alt: "The Amal owl reading a book" },
        heading: first ? `We missed you this week, ${first}` : "We missed you this week",
        paragraphs: ["Your next lesson is ready whenever you are. Even ten minutes today keeps the learning going."],
        cta: { label: "Open my next lesson", url: `${siteUrl}/dashboard` },
        ...footer,
      },
      args,
    );
  }
  const lessonWord = summary.lessonsCompleted === 1 ? "lesson" : "lessons";
  return render(
    summary.lessonsCompleted ? `Your week on Amal: ${n(summary.lessonsCompleted)} ${lessonWord} completed` : "Your week on Amal",
    {
      language,
      preheader: `Your family's report card for ${weekLabel}.`,
      hero: { art: "celebrate", alt: "The Amal owl dancing" },
      heading: first ? `What a week, ${first}!` : "What a week!",
      paragraphs: [`Here's your family's report card for ${weekLabel}.`, ...childLines],
      board: {
        title: "This week",
        stats: [
          { value: n(summary.lessonsCompleted), label: `${lessonWord} completed` },
          ...(summary.practiceTried ? [{ value: `${n(summary.practicePassed)}/${n(summary.practiceTried)}`, label: "Practice sets passed" }] : []),
          { value: `${n(daysLearned)}/7`, label: daysLearned === 1 ? "day of learning" : "days of learning" },
        ],
      },
      week: week("Days you learned"),
      closingParagraphs: [
        summary.streakDays > 1
          ? `You're on a ${n(summary.streakDays)}-day streak. Keep it going tomorrow!`
          : "A little every day adds up. See you tomorrow!",
      ],
      cta: { label: "Keep learning", url: `${siteUrl}/dashboard` },
      secondaryLink: { label: "See full progress", url: `${siteUrl}/progress` },
      ...footer,
    },
    args,
  );
}

export type VolunteerImpact = {
  starts: number;
  completions: number;
  learners: number;
  topLessonTitle: string | null;
};

export function volunteerImpactEmail(
  args: Base & { unsubscribeUrl: string; monthLabel: string; impact: VolunteerImpact },
): RenderedEmail {
  const { language, name, siteUrl, unsubscribeUrl, monthLabel, impact } = args;
  const first = firstName(name);
  const n = (value: number) => formatNumber(language, value);

  if (language === "ar") {
    return render(
      `بدأ الأطفال دروسك ${n(impact.starts)} مرة في ${monthLabel}`,
      {
        language,
        preheader: "شكراً لأنك تبقي الأطفال يتعلّمون.",
        hero: { art: "thanks", alt: "بومة آمال سعيدة وحولها قلوب" },
        heading: first ? `شكراً لك يا ${first}!` : "شكراً لك!",
        paragraphs: [`هذا ما حققته دروسك في ${monthLabel}.`],
        board: {
          title: `${monthLabel} بالأرقام`,
          stats: [
            { value: n(impact.starts), label: "مرات بدء دروسك" },
            { value: n(impact.completions), label: "دروس مكتملة" },
            { value: n(impact.learners), label: "أطفال وصلتهم دروسك" },
          ],
          ...(impact.topLessonTitle ? { note: `الأكثر مشاهدة: «${impact.topLessonTitle}»` } : {}),
        },
        closingParagraphs: ["كل تسجيل يبقي طفلاً يتعلّم. شكراً لأنك تمنحنا وقتك."],
        cta: { label: "سجّل درساً آخر", url: `${siteUrl}/teacher/lessons/new` },
        footerNote: "يصلك هذا الملخص مرة في الشهر لأنك تدرّس في مدرسة آمال.",
        unsubscribe: { label: "إيقاف الملخص الشهري", url: unsubscribeUrl },
      },
      args,
    );
  }
  return render(
    `Children started your lessons ${n(impact.starts)} times in ${monthLabel}`,
    {
      language,
      preheader: "Thank you for keeping children learning.",
      hero: { art: "thanks", alt: "The happy Amal owl surrounded by hearts" },
      heading: first ? `Thank you, ${first}!` : "Thank you!",
      paragraphs: [`Here's what your lessons did in ${monthLabel}.`],
      board: {
        title: `${monthLabel} in numbers`,
        stats: [
          { value: n(impact.starts), label: impact.starts === 1 ? "lesson start" : "lesson starts" },
          { value: n(impact.completions), label: impact.completions === 1 ? "lesson completed" : "lessons completed" },
          { value: n(impact.learners), label: impact.learners === 1 ? "child reached" : "children reached" },
        ],
        ...(impact.topLessonTitle ? { note: `Most watched: “${impact.topLessonTitle}”` } : {}),
      },
      closingParagraphs: ["Every recording keeps a child learning. Thank you for giving your time."],
      cta: { label: "Record another lesson", url: `${siteUrl}/teacher/lessons/new` },
      footerNote: "You get this summary once a month because you teach on Amal School.",
      unsubscribe: { label: "Stop monthly summaries", url: unsubscribeUrl },
    },
    args,
  );
}

/**
 * Sent once, the first time a child passes a Big Challenge (milestone test).
 * Transactional: it celebrates the child by name and links to the certificate.
 * Child profiles carry no gender, so the wording stays neutral.
 */
export function milestonePassedEmail(
  args: Base & {
    childName: string;
    subjectName: string;
    /** e.g. "weeks 1–4" / "الأسابيع ١–٤" */
    weeksLabel: string;
    stars: 1 | 2 | 3;
    certificateUrl: string;
    bossName?: string | null;
  },
): RenderedEmail {
  const { language, name, siteUrl, childName, subjectName, weeksLabel, stars, certificateUrl, bossName } = args;
  const first = firstName(name);
  const child = childName.trim();
  const starRow = "⭐".repeat(stars);
  if (language === "ar") {
    const who = child || "طفلكم";
    return render(
      bossName ? `🏆 فوز رائع لـ${who} على ${bossName}!` : `🏆 فوز رائع لـ${who} في التحدي الكبير!`,
      {
        language,
        preheader: `شهادة جديدة في ${subjectName} (${weeksLabel}).`,
        hero: { art: "celebrate", alt: "بومة آمال ترقص فرحاً" },
        heading: first ? `خبر سعيد يا ${first}!` : "خبر سعيد!",
        paragraphs: [
          `فوز جديد لـ${who} في التحدي الكبير: ${subjectName} (${weeksLabel}).`,
          bossName ? `هُزم ${bossName} في هذه الجولة، والشهادة جاهزة: ${starRow}` : `الشهادة جاهزة: ${starRow}`,
        ],
        closingParagraphs: ["هذا إنجاز يستحق الاحتفال. شاهدوا الشهادة معاً وشجّعوا الدروس القادمة."],
        cta: { label: "شاهد الشهادة", url: certificateUrl },
        secondaryLink: { label: "تابع مسار التعلّم", url: `${siteUrl}/lessons` },
      },
      args,
    );
  }
  const who = child || "Your child";
  return render(
    bossName ? `🏆 ${who} beat ${bossName} and earned a certificate!` : `🏆 ${who} beat the Big Challenge!`,
    {
      language,
      preheader: `A new certificate in ${subjectName}, ${weeksLabel}.`,
      hero: { art: "celebrate", alt: "The Amal owl dancing" },
      heading: first ? `Great news, ${first}!` : "Great news!",
      paragraphs: [
        `${who} beat the Big Challenge in ${subjectName}, ${weeksLabel}.`,
        bossName ? `${bossName} is defeated, and the certificate is ready: ${starRow}` : `The certificate is ready: ${starRow}`,
      ],
      closingParagraphs: ["That's worth celebrating. Look at the certificate together and cheer on the next lessons."],
      cta: { label: "See the certificate", url: certificateUrl },
      secondaryLink: { label: "Keep learning", url: `${siteUrl}/lessons` },
    },
    args,
  );
}

/**
 * Sent once, the first time a child plays the starting boss ("Meet your first
 * boss"). Only to families who opted in to email updates. No score, no test:
 * Amal now knows where the child is starting.
 */
export function placementDoneEmail(args: Base & { childName: string; bossName: string; subjectName: string }): RenderedEmail {
  const { language, name, siteUrl, childName, bossName, subjectName } = args;
  const first = firstName(name);
  const child = childName.trim();
  if (language === "ar") {
    const who = child || "طفلكم";
    return render(
      `تعرّف ${who} على ${bossName}! 🎉`,
      {
        language,
        preheader: `صار آمال يعرف من أين يبدأ في ${subjectName}.`,
        hero: { art: "welcome", alt: "بومة آمال تلوّح بجناحها" },
        heading: first ? `خبر جميل يا ${first}: تعرّف ${who} على ${bossName}! 🎉` : `تعرّف ${who} على ${bossName}! 🎉`,
        paragraphs: [`صار آمال يعرف من أين يبدأ ${who} في ${subjectName}. سنشجّع كل مهارة جديدة يتعلّمها ${who}، وستجدونها في ملخص يوم الأحد.`],
        cta: { label: `شاهد مهارات ${who}`, url: `${siteUrl}/progress` },
      },
      args,
    );
  }
  const who = child || "Your child";
  return render(
    `${who} met ${bossName}! 🎉`,
    {
      language,
      preheader: `Amal now knows where to start in ${subjectName}.`,
      hero: { art: "welcome", alt: "The Amal owl waving hello" },
      heading: first ? `Good news, ${first}: ${who} met ${bossName}! 🎉` : `${who} met ${bossName}! 🎉`,
      paragraphs: [`Amal now knows where to start in ${subjectName}. We'll cheer on every new skill ${who} learns. You'll see them in your Sunday summary.`],
      cta: { label: `See ${who}'s skills`, url: `${siteUrl}/progress` },
    },
    args,
  );
}
