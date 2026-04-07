'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import {
  OwlThinking,
  OwlEncouraging,
  OwlExcited,
  OwlCelebrating,
  OwlCorrect,
  OwlWrong,
  OwlPointing,
} from '@/components/illustrations';

export type OwlMood =
  | 'thinking'
  | 'encouraging'
  | 'excited'
  | 'celebrating'
  | 'correct'
  | 'wrong'
  | 'pointing'
  | 'idle';

interface HomeworkOwlCompanionProps {
  mood: OwlMood;
  language: 'ar' | 'en';
  /** Hide the speech bubble (owl still shows) */
  quiet?: boolean;
}

const OWL_MAP: Record<OwlMood, React.ComponentType<{ className?: string }>> = {
  thinking: OwlThinking,
  encouraging: OwlEncouraging,
  excited: OwlExcited,
  celebrating: OwlCelebrating,
  correct: OwlCorrect,
  wrong: OwlWrong,
  pointing: OwlPointing,
  idle: OwlThinking,
};

const MESSAGES: Record<OwlMood, { ar: string[]; en: string[] }> = {
  thinking: {
    ar: ['فكّر جيداً...', 'خذ وقتك!', 'ما رأيك؟', 'تأمّل السؤال...'],
    en: ['Think carefully...', 'Take your time!', 'What do you think?', 'Read it again...'],
  },
  encouraging: {
    ar: ['أنت تقدر!', 'لا تستسلم!', 'استمر!', 'أنت ذكي!', 'جرّب مرة أخرى!'],
    en: ["You've got this!", "Don't give up!", 'Keep going!', "You're smart!", 'Try again!'],
  },
  excited: {
    ar: ['رائع!', 'ممتاز!', 'يا سلام!', 'أحسنت الاختيار!'],
    en: ['Awesome!', 'Great pick!', 'Nice!', 'Good choice!'],
  },
  celebrating: {
    ar: ['أحسنت!', 'مبروك!', 'عمل رائع!', 'أنت بطل!'],
    en: ['Well done!', 'Congratulations!', 'Amazing work!', "You're a star!"],
  },
  correct: {
    ar: ['صحيح!', 'إجابة ممتازة!', 'بالضبط!', 'أحسنت!'],
    en: ['Correct!', 'Excellent!', 'Exactly right!', 'Nailed it!'],
  },
  wrong: {
    ar: ['لا بأس!', 'حاول مرة أخرى!', 'قريب!', 'لا تقلق!'],
    en: ["That's okay!", 'Try again!', 'Almost!', "Don't worry!"],
  },
  pointing: {
    ar: ['انظر هنا!', 'لاحظ هذا!', 'تلميح!'],
    en: ['Look here!', 'Notice this!', 'Hint!'],
  },
  idle: {
    ar: ['مرحباً!', 'هيا نبدأ!'],
    en: ['Hello!', "Let's go!"],
  },
};

export default function HomeworkOwlCompanion({
  mood,
  language,
  quiet = false,
}: HomeworkOwlCompanionProps) {
  const [visible, setVisible] = useState(false);
  const prevMoodRef = useRef(mood);
  const [moodChangeCount, setMoodChangeCount] = useState(0);

  // Track mood changes to trigger new random message picks
  useEffect(() => {
    if (mood !== prevMoodRef.current) {
      prevMoodRef.current = mood;
      setMoodChangeCount(c => c + 1);
      setVisible(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    }
  }, [mood]);

  // Initial visibility
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Derive message from mood + change count (stable between renders)
  const message = useMemo(() => {
    const pool = MESSAGES[mood][language];
    return pool[Math.floor(Math.random() * pool.length)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood, language, moodChangeCount]);

  const Owl = OWL_MAP[mood];

  return (
    <div className="flex items-end gap-1.5 sm:gap-2">
      {/* Speech bubble */}
      {!quiet && message && (
        <div
          className={`relative bg-white border-2 border-emerald-200 rounded-2xl rounded-br-sm px-2.5 sm:px-3 py-1.5 sm:py-2 shadow-md max-w-[140px] sm:max-w-[180px] transition-all duration-300 ${
            visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-2 scale-95'
          }`}
        >
          <p className={`text-xs sm:text-sm font-semibold font-fredoka text-gray-700 ${language === 'ar' ? 'text-right' : ''}`}>
            {message}
          </p>
          {/* Tail */}
          <div className="absolute -bottom-[6px] right-3 w-3 h-3 bg-white border-b-2 border-r-2 border-emerald-200 rotate-45" />
        </div>
      )}

      {/* Owl */}
      <div className={`flex-shrink-0 transition-transform duration-500 ${
        mood === 'celebrating' ? 'animate-bounce' : mood === 'wrong' ? 'animate-pulse' : ''
      }`}>
        <Owl className="w-12 h-12 sm:w-16 sm:h-16" />
      </div>
    </div>
  );
}
