'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { OwlCelebrating, OwlMedal, OwlEncouraging, Confetti } from '@/components/illustrations';

interface HomeworkCompletionCardProps {
  language: 'ar' | 'en';
  totalQuestions: number;
  answeredQuestions: number;
  totalPoints: number;
  /** Score (only available if graded) */
  score?: number | null;
  /** Streak info returned from submit API */
  streakDays?: number;
  /** Whether this is viewing after grading vs just-submitted */
  isGraded?: boolean;
  /** Number of questions answered correctly (auto-gradable homework) */
  correctCount?: number;
  /** True when the student reached 100% — the activity is complete */
  isMastered?: boolean;
  /** True when the student can retry to improve their score */
  canRetry?: boolean;
  /** Retry request in flight */
  retrying?: boolean;
  onRetry?: () => void;
  /** Per-question right/wrong, in order — shown as pips (answers stay hidden) */
  questionResults?: ('correct' | 'incorrect')[];
  onClose?: () => void;
}

const translations = {
  ar: {
    submitted: 'أحسنت! تم الإرسال 🎉',
    submittedSub: 'عمل رائع! سيراجعه معلمك قريباً.',
    perfect: 'ممتاز! 🌟',
    perfectSub: 'لقد أجبت على كل الأسئلة بشكل صحيح!',
    result: 'نتيجتك',
    keepGoing: 'محاولة جيدة! حاول مرة أخرى للحصول عليها كلها.',
    questionsAnswered: 'أسئلة تم الإجابة عليها',
    correctLabel: 'إجابات صحيحة',
    pointsEarned: 'نقاط',
    streak: 'يوم متتالي!',
    tryAgain: 'حاول مرة أخرى',
    preparing: 'جاري التحضير…',
    backToHomework: 'العودة للواجبات',
    close: 'إغلاق',
  },
  en: {
    submitted: 'All done! 🎉',
    submittedSub: 'Nicely done — your teacher will check it soon.',
    perfect: 'Perfect! 🌟',
    perfectSub: 'You got every question right!',
    result: 'Your Result',
    keepGoing: 'Good try! Have another go to get them all.',
    questionsAnswered: 'Questions Answered',
    correctLabel: 'Correct answers',
    pointsEarned: 'Points',
    streak: 'Day Streak!',
    tryAgain: 'Try Again',
    preparing: 'Preparing…',
    backToHomework: 'Back to Homework',
    close: 'Close',
  },
};

export default function HomeworkCompletionCard({
  language,
  totalQuestions,
  answeredQuestions,
  totalPoints,
  score,
  streakDays,
  isGraded = false,
  correctCount,
  isMastered = false,
  canRetry = false,
  retrying = false,
  onRetry,
  questionResults,
  onClose,
}: HomeworkCompletionCardProps) {
  const t = translations[language];
  const [starCount, setStarCount] = useState(0);
  // Celebrate (confetti) only on mastery or when there's nothing left to retry.
  const [showConfetti, setShowConfetti] = useState(isMastered || (isGraded && !canRetry) || !isGraded);

  const displayScore = score ?? totalPoints;

  // Animated star count-up
  useEffect(() => {
    if (displayScore <= 0) {
      setStarCount(0);
      return;
    }
    const steps = 20;
    const increment = displayScore / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= displayScore) {
        setStarCount(displayScore);
        clearInterval(timer);
      } else {
        setStarCount(Math.floor(current));
      }
    }, 50);
    return () => clearInterval(timer);
  }, [displayScore]);

  // Auto-dismiss confetti
  useEffect(() => {
    if (!showConfetti) return;
    const timer = setTimeout(() => setShowConfetti(false), 4000);
    return () => clearTimeout(timer);
  }, [showConfetti]);

  // Owl + headline reflect the outcome.
  const OwlComponent = !isGraded
    ? OwlCelebrating
    : isMastered
      ? OwlMedal
      : OwlEncouraging;

  const headline = !isGraded ? t.submitted : isMastered ? t.perfect : t.result;
  const subline = !isGraded ? t.submittedSub : isMastered ? t.perfectSub : t.keepGoing;

  // Warmer gradient when celebrating, gentle amber when there's more to do.
  const headerGradient =
    isGraded && !isMastered && canRetry
      ? 'from-amber-400 to-orange-500'
      : 'from-emerald-500 to-emerald-600';

  return (
    <>
      {showConfetti && <Confetti />}
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-pop-in max-h-[90vh] overflow-y-auto">
          {/* Header gradient */}
          <div className={`bg-gradient-to-b ${headerGradient} px-5 sm:px-6 pt-6 sm:pt-8 pb-10 sm:pb-12 text-center relative`}>
            <div className="relative z-10">
              <OwlComponent className="w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-2 sm:mb-3" />
              <h2 className="text-xl sm:text-2xl font-bold font-fredoka text-white">{headline}</h2>
              <p className="text-white/90 text-xs sm:text-sm mt-1">{subline}</p>
            </div>
            {/* Decorative circles */}
            <div className="absolute top-4 left-4 w-8 h-8 rounded-full bg-white/10" />
            <div className="absolute top-12 right-6 w-5 h-5 rounded-full bg-white/10" />
            <div className="absolute bottom-4 left-12 w-4 h-4 rounded-full bg-white/10" />
          </div>

          {/* Stats */}
          <div className="px-6 -mt-6 relative z-10">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              {/* Score / Stars */}
              {isGraded && (
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <svg className="w-7 h-7 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                    <span className="text-3xl font-bold font-fredoka text-gray-900 tabular-nums">{starCount}</span>
                    <span className="text-lg text-gray-400 font-fredoka">/ {totalPoints}</span>
                  </div>
                  <p className="text-xs text-gray-500">{t.pointsEarned}</p>
                </div>
              )}

              {/* Per-question pips — shows which were right/wrong WITHOUT revealing answers */}
              {questionResults && questionResults.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  {questionResults.map((r, i) => (
                    <span
                      key={i}
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-white ${
                        r === 'correct' ? 'bg-emerald-500' : 'bg-red-400'
                      }`}
                      aria-label={r === 'correct' ? 'correct' : 'incorrect'}
                    >
                      {r === 'correct' ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </span>
                  ))}
                </div>
              )}

              {/* Correct count (auto-gradable) or questions answered */}
              {correctCount != null ? (
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-xl">
                  <span className="text-sm text-gray-600">{t.correctLabel}</span>
                  <span className="text-sm font-bold font-fredoka text-gray-900">
                    {correctCount}/{totalQuestions}
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-xl">
                  <span className="text-sm text-gray-600">{t.questionsAnswered}</span>
                  <span className="text-sm font-bold font-fredoka text-gray-900">
                    {answeredQuestions}/{totalQuestions}
                  </span>
                </div>
              )}

              {/* Streak */}
              {streakDays != null && streakDays > 0 && (
                <div className="flex items-center justify-center gap-2 px-3 py-2 bg-amber-50 rounded-xl">
                  <span className="text-lg">🔥</span>
                  <span className="text-sm font-bold font-fredoka text-amber-700">
                    {streakDays} {t.streak}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="px-5 sm:px-6 py-4 sm:py-5 space-y-2 pb-safe">
            {canRetry && onRetry ? (
              <>
                <button
                  onClick={onRetry}
                  disabled={retrying}
                  className="block w-full py-3.5 bg-amber-500 text-white text-center font-bold font-fredoka rounded-2xl hover:bg-amber-600 transition-colors shadow-lg shadow-amber-500/30 disabled:opacity-60"
                >
                  {retrying ? t.preparing : t.tryAgain}
                </button>
                <Link
                  href="/homework"
                  className="block w-full py-2.5 text-gray-500 text-sm font-medium text-center hover:text-gray-700 transition-colors"
                >
                  {t.backToHomework}
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/homework"
                  className="block w-full py-3.5 bg-emerald-600 text-white text-center font-bold font-fredoka rounded-2xl hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/30"
                >
                  {t.backToHomework}
                </Link>
                {onClose && (
                  <button
                    onClick={onClose}
                    className="w-full py-2.5 text-gray-500 text-sm font-medium hover:text-gray-700 transition-colors"
                  >
                    {t.close}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
