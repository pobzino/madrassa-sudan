'use client'

import { useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import type { QuizSettings } from '@/lib/database.types'

interface QuizQuestion {
  id: string
  question_text_ar: string
  question_text_en: string | null
  question_type: 'multiple_choice' | 'true_false' | 'fill_in_blank'
  options: unknown
  correct_answer: string
  explanation_ar: string | null
  explanation_en: string | null
  allow_retry: boolean
}

interface QuizOverlayProps {
  question: QuizQuestion
  settings: QuizSettings
  onComplete: () => void
  onResponse: (data: { questionId: string; answer: string; isCorrect: boolean }) => Promise<{ canRetry: boolean }>
}

export default function EnhancedQuizOverlay({
  question,
  settings,
  onComplete,
  onResponse
}: QuizOverlayProps) {
  const { language } = useLanguage()
  const [selectedAnswer, setSelectedAnswer] = useState<string>('')
  const [fillInAnswer, setFillInAnswer] = useState<string>('')
  const [hasAnswered, setHasAnswered] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const [canRetry, setCanRetry] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [attemptCount, setAttemptCount] = useState(0)
  const [showExplanation, setShowExplanation] = useState(false)

  const t = {
    ar: {
      question: 'سؤال',
      submit: 'إرسال',
      correct: 'إجابة صحيحة! 🎉',
      incorrect: 'إجابة خاطئة',
      tryAgain: 'حاول مرة أخرى',
      continue: 'متابعة',
      explanation: 'التفسير',
      attempt: 'محاولة',
      fillBlank: 'اكتب إجابتك هنا...',
      true: 'صح',
      false: 'خطأ'
    },
    en: {
      question: 'Question',
      submit: 'Submit',
      correct: 'Correct! 🎉',
      incorrect: 'Incorrect',
      tryAgain: 'Try Again',
      continue: 'Continue',
      explanation: 'Explanation',
      attempt: 'Attempt',
      fillBlank: 'Type your answer here...',
      true: 'True',
      false: 'False'
    }
  }

  const text = t[language]
  const questionText = language === 'ar' ? question.question_text_ar : (question.question_text_en || question.question_text_ar)
  const explanation = language === 'ar' ? question.explanation_ar : (question.explanation_en || question.explanation_ar)
  let options: string[] = []

  if (Array.isArray(question.options)) {
    options = question.options.filter((option): option is string => typeof option === 'string')
  } else if (typeof question.options === 'string') {
    try {
      const parsed = JSON.parse(question.options)
      options = Array.isArray(parsed) ? parsed.filter((option): option is string => typeof option === 'string') : []
    } catch {
      options = []
    }
  }

  const handleSubmit = async () => {
    if (isSubmitting || (!selectedAnswer && !fillInAnswer)) return

    setIsSubmitting(true)
    setAttemptCount(prev => prev + 1)

    let answer = selectedAnswer
    if (question.question_type === 'fill_in_blank') {
      answer = fillInAnswer.trim()
    }

    // Check if correct (case-insensitive for fill-in-blank)
    const correct = question.question_type === 'fill_in_blank'
      ? answer.toLowerCase() === question.correct_answer.toLowerCase()
      : answer === question.correct_answer

    try {
      const result = await onResponse({
        questionId: question.id,
        answer,
        isCorrect: correct
      })

      setIsCorrect(correct)
      setCanRetry(question.allow_retry && settings.allow_retries && result.canRetry)
      setHasAnswered(true)
      setShowExplanation(settings.show_explanation)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRetry = () => {
    setSelectedAnswer('')
    setFillInAnswer('')
    setHasAnswered(false)
    setShowExplanation(false)
  }

  const handleContinue = () => {
    onComplete()
  }

  const renderQuestionInput = () => {
    if (hasAnswered) return null

    if (question.question_type === 'multiple_choice') {
      return (
        <div className="space-y-3">
          {options.map((option: string, index: number) => (
            <button
              key={index}
              onClick={() => setSelectedAnswer(option)}
              className={`w-full p-4 text-left rounded-xl border-2 transition-all ${
                selectedAnswer === option
                  ? 'border-[#007229] bg-[#007229]/5'
                  : 'border-gray-200 hover:border-[#007229]/40 bg-white'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      )
    }

    if (question.question_type === 'true_false') {
      return (
        <div className="flex gap-4">
          <button
            onClick={() => setSelectedAnswer('true')}
            className={`flex-1 py-6 px-4 rounded-lg border-2 font-bold text-lg transition-all ${
              selectedAnswer === 'true'
                ? 'border-green-500 bg-green-50 text-green-700'
                : 'border-gray-300 hover:border-green-300 bg-white'
            }`}
          >
            ✓ {text.true}
          </button>
          <button
            onClick={() => setSelectedAnswer('false')}
            className={`flex-1 py-6 px-4 rounded-lg border-2 font-bold text-lg transition-all ${
              selectedAnswer === 'false'
                ? 'border-red-500 bg-red-50 text-red-700'
                : 'border-gray-300 hover:border-red-300 bg-white'
            }`}
          >
            ✗ {text.false}
          </button>
        </div>
      )
    }

    if (question.question_type === 'fill_in_blank') {
      return (
        <div>
          <input
            type="text"
            value={fillInAnswer}
            onChange={(e) => setFillInAnswer(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder={text.fillBlank}
            className="w-full px-4 py-3 text-lg border-2 border-gray-200 rounded-xl focus:border-[#007229] focus:outline-none"
            autoFocus
          />
        </div>
      )
    }
  }

  const renderFeedback = () => {
    if (!hasAnswered) return null

    return (
      <div className={`p-6 rounded-xl ${isCorrect ? 'bg-green-50 border-2 border-green-500' : 'bg-red-50 border-2 border-red-500'}`}>
        <div className="flex items-center gap-3 mb-4">
          {isCorrect ? (
            <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center text-white text-2xl">
              ✓
            </div>
          ) : (
            <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center text-white text-2xl">
              ✗
            </div>
          )}
          <div>
            <p className={`text-lg font-bold ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
              {isCorrect ? text.correct : text.incorrect}
            </p>
            <p className="text-sm text-gray-600">
              {text.attempt} {attemptCount}
            </p>
          </div>
        </div>

        {!isCorrect && (
          <div className="mb-4 p-3 bg-white rounded border border-gray-200">
            <p className="text-sm text-gray-600 mb-1">الإجابة الصحيحة / Correct Answer:</p>
            <p className="font-medium">{question.correct_answer}</p>
          </div>
        )}

        {showExplanation && explanation && (
          <div className="mb-4 p-3 bg-white rounded border border-gray-200">
            <p className="text-sm font-medium text-gray-700 mb-2">
              {text.explanation}:
            </p>
            <p className="text-gray-600">{explanation}</p>
          </div>
        )}

        <div className="flex gap-3">
          {!isCorrect && canRetry && (
            <button
              onClick={handleRetry}
              className="px-6 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-medium"
            >
              {text.tryAgain}
            </button>
          )}
          <button
            onClick={handleContinue}
            className="px-6 py-2 bg-[#007229] text-white rounded-xl hover:bg-[#005C22] font-medium"
          >
            {text.continue} →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="px-3 py-1 bg-[#007229]/10 text-[#007229] rounded-full text-sm font-medium">
                {text.question}
              </span>
              {attemptCount > 0 && (
                <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                  {text.attempt} {attemptCount}
                </span>
              )}
            </div>
            <h2 className="text-2xl font-bold mb-2">{questionText}</h2>
          </div>

          {/* Question Input */}
          {renderQuestionInput()}

          {/* Submit Button */}
          {!hasAnswered && (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || (!selectedAnswer && !fillInAnswer)}
              className="mt-4 w-full px-6 py-3 bg-[#007229] text-white rounded-xl hover:bg-[#005C22] font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isSubmitting ? '...' : text.submit}
            </button>
          )}

          {/* Feedback */}
          {renderFeedback()}
        </div>
      </div>
    </div>
  )
}
