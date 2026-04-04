'use client'

import { useState, useEffect, useRef } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import type { LessonTask, MatchingPairsData, SortingOrderData } from '@/lib/tasks.types'
import { Link2, ArrowUpDown, PenLine, Tag, Brush, Mic, type LucideIcon } from 'lucide-react'
import MatchingPairsTask from './MatchingPairsTask'
import SortingOrderTask from './SortingOrderTask'

interface TaskOverlayProps {
  task: LessonTask
  lessonId: string
  onComplete: (score: number) => void
  onSkip: () => void
}

const TASK_LABELS: Record<string, { ar: string; en: string; icon: LucideIcon; color: string }> = {
  matching_pairs: { ar: 'وصّل الأزواج', en: 'Match Pairs', icon: Link2, color: 'amber' },
  sorting_order: { ar: 'رتّب', en: 'Sort', icon: ArrowUpDown, color: 'violet' },
  fill_in_blank_enhanced: { ar: 'املأ الفراغ', en: 'Fill Blanks', icon: PenLine, color: 'blue' },
  drag_drop_label: { ar: 'سمّ الأجزاء', en: 'Label It', icon: Tag, color: 'teal' },
  drawing_tracing: { ar: 'ارسم', en: 'Draw', icon: Brush, color: 'pink' },
  audio_recording: { ar: 'سجّل صوتك', en: 'Record', icon: Mic, color: 'red' },
}

export default function TaskOverlay({ task, lessonId, onComplete, onSkip }: TaskOverlayProps) {
  const { language } = useLanguage()
  const isAr = language === 'ar'
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<{ score: number } | null>(null)
  const [timeRemaining, setTimeRemaining] = useState<number | null>(task.timeout_seconds)
  const startTime = useRef(Date.now())

  const t = {
    ar: {
      skip: 'تخطي',
      submit: 'إرسال',
      score: 'النتيجة',
      continue: 'متابعة',
      perfect: 'ممتاز! 🎉',
      great: 'أحسنت! 👏',
      good: 'جيد!',
      tryBetter: 'واصل المحاولة، ستتحسن! 💪',
      timeUp: 'انتهى الوقت!',
      seconds: 'ث',
    },
    en: {
      skip: 'Skip',
      submit: 'Submit',
      score: 'Score',
      continue: 'Continue',
      perfect: 'Perfect! 🎉',
      great: 'Great job! 👏',
      good: 'Good!',
      tryBetter: 'Keep going, you\u2019ll get there! 💪',
      timeUp: "Time's up!",
      seconds: 's',
    },
  }
  const text = t[language]

  const title = isAr ? task.title_ar : (task.title_en || task.title_ar)
  const instruction = isAr ? task.instruction_ar : (task.instruction_en || task.instruction_ar)
  const label = TASK_LABELS[task.task_type] || TASK_LABELS.matching_pairs

  // Timer countdown
  useEffect(() => {
    if (timeRemaining === null || timeRemaining <= 0 || result) return
    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(timer)
          // Auto-skip on timeout
          if (!result) onSkip()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [timeRemaining, result, onSkip])

  const handleSubmit = async (responseData: Record<string, unknown>) => {
    if (isSubmitting) return
    setIsSubmitting(true)

    const timeSpent = Math.floor((Date.now() - startTime.current) / 1000)

    try {
      const res = await fetch(`/api/lessons/${lessonId}/task-responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: task.id,
          response_data: responseData,
          time_spent_seconds: timeSpent,
        }),
      })
      const json = await res.json()
      const score = json.score ?? 0
      setResult({ score })
    } catch {
      setResult({ score: 0 })
    } finally {
      setIsSubmitting(false)
    }
  }

  const getScoreMessage = (score: number) => {
    if (score >= 1) return text.perfect
    if (score >= 0.7) return text.great
    if (score >= 0.4) return text.good
    return text.tryBetter
  }

  const renderTask = () => {
    const data = task.task_data as Record<string, unknown>
    switch (task.task_type) {
      case 'matching_pairs':
        return (
          <MatchingPairsTask
            data={data as unknown as MatchingPairsData}
            language={language}
            onSubmit={handleSubmit}
            disabled={isSubmitting || !!result}
          />
        )
      case 'sorting_order':
        return (
          <SortingOrderTask
            data={data as unknown as SortingOrderData}
            language={language}
            onSubmit={handleSubmit}
            disabled={isSubmitting || !!result}
          />
        )
      default:
        return (
          <div className="text-center py-8 text-gray-500">
            {isAr ? 'نوع المهمة غير مدعوم بعد' : 'Task type not yet supported'}
          </div>
        )
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div
        dir={isAr ? 'rtl' : 'ltr'}
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6">
          {/* Header */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1.5 bg-${label.color}-100 text-${label.color}-700 rounded-full text-sm font-bold`}>
                  <label.icon className="inline w-4 h-4" /> {isAr ? label.ar : label.en}
                </span>
                {task.points > 0 && (
                  <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                    {task.points} pts
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {timeRemaining !== null && !result && (
                  <span className={`px-3 py-1.5 rounded-full text-sm font-mono font-bold ${
                    timeRemaining <= 10 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {timeRemaining}{text.seconds}
                  </span>
                )}
                {task.is_skippable && !result && (
                  <button
                    onClick={onSkip}
                    className="px-3 py-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg text-sm transition-colors"
                  >
                    {text.skip} →
                  </button>
                )}
              </div>
            </div>
            <h2 className={`text-xl sm:text-2xl font-bold text-gray-900 mb-2 ${isAr ? 'font-cairo' : 'font-fredoka'}`}>
              {title}
            </h2>
            <p className={`text-gray-600 ${isAr ? 'font-cairo' : ''}`}>
              {instruction}
            </p>
          </div>

          {/* Task content */}
          {!result && renderTask()}

          {/* Result */}
          {result && (
            <div className="mt-4">
              <div className={`p-6 rounded-xl ${
                result.score >= 0.7
                  ? 'bg-green-50 border-2 border-green-400'
                  : 'bg-amber-50 border-2 border-amber-400'
              }`}>
                <div className="text-center mb-4">
                  <div className="text-4xl mb-2">
                    {result.score >= 0.7 ? '🌟' : result.score >= 0.4 ? '👍' : '💪'}
                  </div>
                  <p className="text-lg font-bold text-gray-900">
                    {getScoreMessage(result.score)}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    {text.score}: {Math.round(result.score * 100)}%
                  </p>
                </div>
                <button
                  onClick={() => onComplete(result.score)}
                  className="w-full px-6 py-3 bg-[#007229] text-white rounded-xl hover:bg-[#005C22] font-medium transition-colors"
                >
                  {text.continue} →
                </button>
              </div>
            </div>
          )}

          {/* Loading indicator */}
          {isSubmitting && (
            <div className="mt-4 text-center">
              <div className="inline-block w-6 h-6 border-2 border-[#007229] border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
