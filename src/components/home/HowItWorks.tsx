"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, Calculator, Check, Lock, Music2, Play } from "lucide-react";
import type { Language } from "@/contexts/LanguageContext";
import { LivingOwl, type OwlMood } from "@/components/brand/LivingOwl";
import { useOwlShow, type OwlAct } from "@/components/brand/useOwlShow";
import { DayMeadow, DaySky } from "./DayMeadow";
import { handwritingClass } from "./handwriting";

const STEP_MOODS: OwlMood[] = ["wave", "read", "party"];
// Once a step's own reaction is over, the owl keeps busy with these.
const SHOW_ACTS: readonly OwlAct[] = ["sudanese", "curious", "party"];
const SHOW_REST: readonly [number, number] = [5000, 9000];

const copy = {
  en: {
    titleStart: "Learn it. Practise it.",
    titleHighlight: "Celebrate it.",
    subtitle: "Every lesson is your teacher's own voice, followed by Practice that checks every answer. Free, on a phone or a computer.",
    steps: [
      {
        title: "Start free",
        desc: "Create a free family account in minutes, then pick Maths or English.",
        note: "free, always",
      },
      {
        title: "Follow the learning path",
        desc: "Every lesson is your teacher's own voice with activities, and new weeks unlock as you go.",
        note: "new weeks unlock as you go",
      },
      {
        title: "Pass Practice and celebrate",
        desc: "Ten quick questions, each checked instantly. Score 75% to complete the lesson, and retry as often as you like.",
        note: "retry as often as you like",
      },
    ],
    cta: "Create a free account",
    ctaAuthed: "Continue learning",
    dance: "Make the owl dance",
    bubble: "Let's dance!",
    welcome: {
      hello: "Hey, Sara! 👋",
      ready: "Ready for a new learning adventure?",
      continue: "Continue learning",
      pick: "Pick a Subject",
      maths: "Maths",
      english: "English",
      foot: "Free for every family",
    },
    path: {
      title: "Your learning path",
      english: "English",
      maths: "Maths",
      first: "Hello & Goodbye",
      continue: "Continue",
      watched: "60% watched",
      test: "Test",
      passMark: "75% to pass",
    },
    practice: {
      title: "Practice complete!",
      passed: "Passed",
      need: "You need 75% to complete the lesson",
      next: "Next lesson",
    },
  },
  ar: {
    titleStart: "تعلّمه. تدرّب عليه.",
    titleHighlight: "واحتفل به.",
    subtitle: "كل درس بصوت معلّمك، يليه تدريب يصحّح كل إجابة. مجاناً، على الهاتف أو الكمبيوتر.",
    steps: [
      {
        title: "ابدأ مجاناً",
        desc: "أنشئ حساباً عائلياً مجانياً في دقائق، ثم اختر الرياضيات أو الإنجليزية.",
        note: "مجاني دائماً",
      },
      {
        title: "اتبع مسار التعلّم",
        desc: "كل درس بصوت معلّمك مع أنشطة تفاعلية، وتُفتح أسابيع جديدة كلما تقدّمت.",
        note: "أسابيع جديدة تُفتح كلما تقدّمت",
      },
      {
        title: "انجح في التدريب واحتفل",
        desc: "عشرة أسئلة سريعة تُصحَّح فوراً. احصل على ٧٥٪ لإكمال الدرس، وأعد المحاولة كما تشاء.",
        note: "أعد المحاولة كما تشاء",
      },
    ],
    cta: "أنشئ حساباً مجانياً",
    ctaAuthed: "واصل التعلّم",
    dance: "اجعل البومة ترقص",
    bubble: "يلا نرقص!",
    welcome: {
      hello: "أهلاً يا سارة! 👋",
      ready: "مستعد لمغامرة تعليمية جديدة؟",
      continue: "واصل التعلم",
      pick: "اختر مادة",
      maths: "الرياضيات",
      english: "الإنجليزية",
      foot: "مجاني لكل عائلة",
    },
    path: {
      title: "مسار تعلّمك",
      english: "الإنجليزية",
      maths: "الرياضيات",
      first: "Hello & Goodbye",
      continue: "أكمل",
      watched: "شاهدت ٦٠٪",
      test: "اختبار",
      passMark: "٧٥٪ للنجاح",
    },
    practice: {
      title: "أكملت التدريب!",
      passed: "ناجح",
      need: "تحتاج ٧٥٪ لإكمال الدرس",
      next: "الدرس التالي",
    },
  },
};

type Copy = (typeof copy)["en"];

// How far through the scroll track each step's segment is filled (0..1).
const segmentFill = (index: number): CSSProperties => ({
  transform: `scaleX(clamp(0, calc(var(--hiw-progress, 0) * 3 - ${index}), 1))`,
});

function stickyTop() {
  return window.innerWidth >= 640 ? 64 : 56;
}

/**
 * "How it works" as one scroll: the device stays pinned while the page
 * scrolls, and the screen moves through the three steps on its own.
 */
export function HowItWorks({ language, isRtl, isAuthenticated }: { language: Language; isRtl: boolean; isAuthenticated: boolean }) {
  const txt = copy[language];
  const hand = handwritingClass(language);
  const [active, setActive] = useState(0);
  const [actedOnStep, setActedOnStep] = useState<number | null>(null);
  const [shownStep, setShownStep] = useState(active);
  const trackRef = useRef<HTMLDivElement>(null);
  const { ref: owlRef, act, finish, perform } = useOwlShow<HTMLDivElement>({
    acts: SHOW_ACTS,
    firstDelay: 5500,
    rest: SHOW_REST,
    resetKey: active,
  });

  // Each new step gets a fresh reaction.
  if (shownStep !== active) {
    setShownStep(active);
    setActedOnStep(null);
  }

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = track.getBoundingClientRect();
      const top = stickyTop();
      const distance = rect.height - (window.innerHeight - top);
      const progress = distance > 0 ? Math.min(1, Math.max(0, (top - rect.top) / distance)) : 0;
      track.style.setProperty("--hiw-progress", progress.toFixed(4));
      setActive(Math.min(2, Math.floor(progress * 3)));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  const scrollToStep = (index: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const top = stickyTop();
    const distance = rect.height - (window.innerHeight - top);
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({
      top: window.scrollY + rect.top - top + distance * ((index + 0.45) / 3),
      behavior: smooth ? "smooth" : "auto",
    });
  };

  const onActEnd = () => {
    finish();
    setActedOnStep(active);
  };

  // After the first performance on a step, settle rather than repeat its reaction.
  const baseMood: OwlMood = actedOnStep === active ? (active === 1 ? "read" : "idle") : STEP_MOODS[active];
  const mood: OwlMood = act && act !== "fly" ? act : baseMood;
  const dancing = act === "sudanese" || act === "party";
  // The owl stands beside the device and keeps glancing at its screen.
  const restGaze = { x: isRtl ? 0.75 : -0.75, y: active === 1 ? 0.35 : 0.05 };

  const cta = (className: string) => (
    <Link
      href={isAuthenticated ? "/dashboard" : "/auth/signup"}
      {...(isAuthenticated ? {} : { "data-analytics": "signup_click", "data-analytics-source": "how_it_works" })}
      className={`items-center gap-2 rounded-full bg-[#007229] px-6 py-3.5 font-bold text-white shadow-xl shadow-[#007229]/30 transition hover:-translate-y-0.5 hover:bg-[#005C22] ${className}`}
    >
      {isAuthenticated ? txt.ctaAuthed : txt.cta}
      <ArrowRight className="h-5 w-5 rtl:-scale-x-100" />
    </Link>
  );

  return (
    <section id="how-it-works" className="relative bg-[#eef6ee] text-gray-900">
      <DaySky />

      <div className="relative mx-auto max-w-6xl px-4 pt-16 sm:px-6 sm:pt-24">
        <h2 className="font-fredoka text-4xl font-semibold leading-[1.05] text-balance sm:text-5xl lg:text-6xl">
          {txt.titleStart} <span className="text-[#007229]">{txt.titleHighlight}</span>
        </h2>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-gray-600 sm:text-lg">{txt.subtitle}</p>
      </div>

      <div ref={trackRef} className="relative h-[300svh]">
        <div className="sticky top-14 flex h-[calc(100svh-3.5rem)] items-center overflow-hidden sm:top-16 sm:h-[calc(100svh-4rem)]">
          <DayMeadow active={active} celebrate={active === 2} />

          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-5 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:gap-10">
            {/* Full step list: visible on desktop, read by screen readers everywhere. */}
            <div className="sr-only lg:not-sr-only">
              <div className="relative">
                <span aria-hidden className="absolute bottom-7 top-7 w-[3px] overflow-hidden rounded-full bg-emerald-900/10 ltr:left-[1.85rem] rtl:right-[1.85rem]">
                  <span className="block h-full origin-top bg-amber-400" style={{ transform: "scaleY(var(--hiw-progress, 0))" }} />
                </span>
                <ol className="relative space-y-2">
                  {txt.steps.map((step, i) => {
                    const current = i === active;
                    return (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => scrollToStep(i)}
                          aria-current={current ? "step" : undefined}
                          className={`relative flex w-full items-start gap-4 rounded-2xl px-4 py-4 text-start transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007229] sm:px-5 ${
                            current ? "bg-white/90 shadow-lg shadow-emerald-900/5 ring-1 ring-emerald-100" : "hover:bg-white/50"
                          }`}
                        >
                          <span
                            className={`relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-fredoka text-sm font-bold transition-colors ${
                              i <= active ? "bg-amber-400 text-amber-950" : "bg-white text-gray-400 ring-1 ring-gray-200"
                            }`}
                          >
                            {i < active ? <Check className="h-4 w-4" strokeWidth={3} /> : String(i + 1).padStart(2, "0")}
                          </span>
                          <span className="min-w-0">
                            <span className={`block font-fredoka text-xl font-semibold ${current ? "text-gray-900" : "text-gray-500"}`}>{step.title}</span>
                            <span
                              className={`grid transition-[grid-template-rows,opacity] duration-300 ${
                                current ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                              }`}
                            >
                              <span className="overflow-hidden">
                                <span className="block pt-1.5 text-base leading-relaxed text-gray-600">{step.desc}</span>
                              </span>
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
              {cta("mt-8 hidden lg:inline-flex")}
            </div>

            {/* Phones: the current step above the device, with scroll progress. */}
            <div aria-hidden className="lg:hidden">
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-emerald-900/10">
                    <span className="block h-full origin-left bg-amber-400 rtl:origin-right" style={segmentFill(i)} />
                  </span>
                ))}
              </div>
              <div key={`${active}-${language}`} className="mt-3 min-h-[5.5rem] animate-[hiw-note_.35s_ease-out_both]">
                <p className="font-fredoka text-2xl font-semibold leading-tight">{txt.steps[active].title}</p>
                <p className="mt-1 text-sm leading-relaxed text-gray-600">{txt.steps[active].desc}</p>
              </div>
            </div>

            <div className="relative mx-auto flex w-full max-w-[520px] justify-center ltr:pr-28 rtl:pl-28">
              {/* Handwritten note, on the side away from the owl. */}
              <p
                key={`note-${active}-${language}`}
                aria-hidden
                className={`${hand} pointer-events-none absolute top-[30%] z-20 hidden w-36 animate-[hiw-note_.5s_ease-out_both] text-[1.65rem] leading-[1.05] text-[#007229] ltr:-left-28 ltr:-rotate-6 ltr:text-right rtl:-right-28 rtl:rotate-6 rtl:text-left xl:block`}
              >
                {txt.steps[active].note}
                <svg viewBox="0 0 80 40" className="mt-1 h-8 w-20 ltr:ml-auto rtl:mr-auto rtl:-scale-x-100" fill="none">
                  <path d="M4 6C24 4 50 10 70 30" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  <path d="M58 30L71 31L69 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </p>

              <Device txt={txt} active={active} />

              <div ref={owlRef} className="absolute bottom-0 z-30 w-32 ltr:right-0 rtl:left-0 sm:w-48">
                {dancing && (
                  <p
                    aria-hidden
                    className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 animate-[hiw-pop_.3s_ease-out_both] whitespace-nowrap rounded-2xl bg-white px-3.5 py-1.5 font-fredoka text-base font-semibold text-[#D21034] shadow-lg"
                  >
                    {txt.bubble} <Music2 className="inline h-4 w-4" />
                    <span className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-white" />
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => perform("sudanese")}
                  aria-label={txt.dance}
                  className="block w-full cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#007229]"
                >
                  <LivingOwl mood={mood} restGaze={restGaze} onActEnd={onActEnd} className="w-full" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative flex justify-center px-4 pb-16 pt-4 lg:hidden">{cta("inline-flex")}</div>
      <div className="hidden h-12 lg:block" />
    </section>
  );
}

function Device({ txt, active }: { txt: Copy; active: number }) {
  const screens = [<WelcomeScreen key="welcome" txt={txt} />, <PathScreen key="path" txt={txt} />, <PracticeScreen key="practice" txt={txt} />];

  // Styled like the site's own cards (white, soft green ring, soft shadow) so it sits in the meadow.
  return (
    <div className="relative z-10 w-[232px] -rotate-1 rtl:rotate-1 sm:w-[300px]">
      <span aria-hidden className="absolute -bottom-5 left-1/2 h-6 w-[78%] -translate-x-1/2 rounded-[50%] bg-emerald-900/15 blur-md" />
      <div className="relative rounded-[2.4rem] bg-white p-3 text-gray-900 shadow-[0_30px_60px_-24px_rgba(6,78,59,.4)] ring-1 ring-emerald-100">
        <span aria-hidden className="mx-auto mb-2 block h-1.5 w-12 rounded-full bg-emerald-100" />

        <div
          aria-hidden
          className="relative h-[360px] overflow-hidden rounded-[1.8rem] bg-white ring-1 ring-emerald-100 sm:h-[410px] [@media(max-height:700px)]:h-[300px]"
        >
          {screens.map((screen, i) => (
            <div
              key={i}
              className={`absolute inset-0 transition-all ${
                i === active ? "translate-y-0 opacity-100 delay-150 duration-500" : "pointer-events-none translate-y-3 opacity-0 duration-150"
              }`}
            >
              {screen}
            </div>
          ))}
        </div>

        <div className="mt-2.5 px-1 pb-0.5">
          <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 px-3.5 py-2.5 ring-1 ring-emerald-100">
            <span className="font-fredoka text-xs font-semibold text-[#007229]" dir="ltr">
              {active + 1} / 3
            </span>
            <span className="flex flex-1 gap-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-emerald-100">
                  <span className="block h-full origin-left bg-[#007229] rtl:origin-right" style={segmentFill(i)} />
                </span>
              ))}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScreenHeader() {
  return (
    <div className="flex items-center gap-1.5 border-b border-gray-100 px-4 py-3">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#D21034]">
        <span className="h-2.5 w-2.5 rounded-full bg-white" />
      </span>
      <span className="font-fredoka text-sm font-semibold text-[#007229]">amal school</span>
    </div>
  );
}

function WelcomeScreen({ txt }: { txt: Copy }) {
  return (
    <div className="flex h-full flex-col">
      <ScreenHeader />
      <div className="flex flex-1 flex-col px-4 pt-3 sm:pt-4">
        <p className="font-fredoka text-lg font-semibold leading-tight sm:text-xl">{txt.welcome.hello}</p>
        <p className="mt-0.5 text-xs text-gray-500">{txt.welcome.ready}</p>
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-[#007229] px-3.5 py-3 text-white shadow-[0_3px_0_#005C22]">
          <span className="text-sm font-bold">{txt.welcome.continue}</span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-300 text-[#005C22]">
            <Play className="h-3.5 w-3.5 fill-current rtl:-scale-x-100" />
          </span>
        </div>
        <p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-gray-500">{txt.welcome.pick}</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#007229] text-white">
              <Calculator className="h-5 w-5" />
            </span>
            <span className="mt-2 block text-sm font-bold">{txt.welcome.maths}</span>
            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white">
              <span className="block h-full w-2/3 rounded-full bg-[#00913D]" />
            </span>
          </div>
          <div className="rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-100">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400 text-amber-950">
              <BookOpen className="h-5 w-5" />
            </span>
            <span className="mt-2 block text-sm font-bold">{txt.welcome.english}</span>
            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white">
              <span className="block h-full w-1/3 rounded-full bg-amber-400" />
            </span>
          </div>
        </div>
        <p className="mt-auto pb-3 text-center text-[11px] font-semibold text-gray-400 sm:pb-4">{txt.welcome.foot}</p>
      </div>
    </div>
  );
}

function PathScreen({ txt }: { txt: Copy }) {
  const node = "flex h-12 w-12 items-center justify-center rounded-full shadow-[0_4px_0_rgba(0,0,0,.15)]";
  return (
    <div className="flex h-full flex-col bg-[#F3FAF4]">
      <ScreenHeader />
      <div className="px-4 pt-3">
        <div className="flex gap-1.5">
          <span className="rounded-full bg-[#007229] px-3 py-1 text-[11px] font-bold text-white">{txt.path.english}</span>
          <span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-gray-500 ring-1 ring-gray-200">{txt.path.maths}</span>
        </div>
        <p className="mt-3 font-fredoka text-lg font-semibold">{txt.path.title}</p>
      </div>
      <div className="relative mx-4 mt-2 flex-1">
        <svg aria-hidden className="absolute inset-0 h-full w-full" viewBox="0 0 230 250" preserveAspectRatio="none" fill="none">
          <path d="M40 26C140 26 190 40 190 82C190 124 40 116 40 158C40 200 120 210 188 214" stroke="#BFE3C7" strokeWidth="5" strokeDasharray="2 10" strokeLinecap="round" />
        </svg>
        <div className="absolute start-[4%] top-[2%] flex items-center gap-2" dir="ltr">
          <span className={`${node} bg-[#007229] text-white`}>
            <Check className="h-6 w-6" strokeWidth={3} />
          </span>
          <span className="rounded-md bg-white px-2 py-1 text-[11px] font-bold text-gray-700 shadow-sm">{txt.path.first}</span>
        </div>
        <span className={`${node} absolute end-[6%] top-[25%] bg-[#007229] text-white`}>
          <Check className="h-6 w-6" strokeWidth={3} />
        </span>
        <div className="absolute start-[4%] top-[50%] flex items-center gap-2">
          <span className="relative">
            <span className="absolute -inset-1.5 animate-ping rounded-full bg-amber-300/50 motion-reduce:hidden" />
            <span className={`${node} relative bg-amber-400 text-amber-950`}>
              <Play className="h-5 w-5 fill-current" />
            </span>
          </span>
          <span className="rounded-lg bg-white px-2 py-1 shadow-sm">
            <span className="block text-[11px] font-bold text-gray-800">{txt.path.continue}</span>
            <span className="block text-[10px] font-semibold text-gray-500">{txt.path.watched}</span>
          </span>
        </div>
        <div className="absolute end-[4%] top-[76%] flex items-center gap-2">
          <span className="rounded-lg bg-white px-2 py-1 text-end shadow-sm">
            <span className="block text-[11px] font-bold text-gray-800">{txt.path.test}</span>
            <span className="block text-[10px] font-semibold text-gray-500">{txt.path.passMark}</span>
          </span>
          <span className="flex h-11 w-11 rotate-45 items-center justify-center rounded-xl bg-gray-200 text-gray-400 shadow-[0_4px_0_rgba(0,0,0,.1)]">
            <Lock className="h-4 w-4 -rotate-45" />
          </span>
        </div>
      </div>
    </div>
  );
}

function PracticeScreen({ txt }: { txt: Copy }) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <ScreenHeader />
      <div className="px-4 pt-3">
        <div className="h-2 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full w-full rounded-full bg-[#00913D]" />
        </div>
      </div>
      <div className="flex flex-1 flex-col items-center px-4 pt-3 text-center sm:pt-6">
        <span aria-hidden className="text-3xl sm:text-4xl">🎉</span>
        <p className="mt-1 font-fredoka text-lg font-semibold sm:mt-2 sm:text-xl">{txt.practice.title}</p>
        <div className="relative mt-3 flex h-24 w-24 items-center justify-center sm:mt-4 sm:h-28 sm:w-28">
          <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="60" cy="60" r="50" stroke="#EEF2EE" strokeWidth="12" fill="none" />
            <circle cx="60" cy="60" r="50" stroke="#007229" strokeWidth="12" fill="none" strokeLinecap="round" strokeDasharray="314" strokeDashoffset="31" />
          </svg>
          <span className="font-fredoka text-2xl font-semibold sm:text-3xl" dir="ltr">9/10</span>
        </div>
        <span className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-[#007229]">
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
          {txt.practice.passed}
        </span>
        <p className="mt-1.5 text-[10px] font-semibold leading-snug text-gray-400 sm:text-[11px]">{txt.practice.need}</p>
        <div className="mt-auto w-full pb-3 sm:pb-4">
          <div className="rounded-full bg-[#007229] py-3 text-center text-sm font-bold text-white shadow-[0_3px_0_#005C22]">{txt.practice.next}</div>
        </div>
      </div>
    </div>
  );
}
