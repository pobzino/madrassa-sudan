'use client'

import { useState } from 'react'
import { Database } from '@/lib/database.types'

type QuestionType = Database['public']['Enums']['question_type']
type RawOptions = string[] | string | null | undefined

interface QuestionBuilderQuestion {
  question_type: QuestionType
  question_text_ar: string
  question_text_en: string | null
  timestamp_seconds: number
  correct_answer: string | null
  options: RawOptions
  explanation_ar: string | null
  explanation_en: string | null
  is_required: boolean
  allow_retry: boolean
}

interface QuestionBuilderSaveData {
  question_type: QuestionType
  question_text_ar: string
  question_text_en: string
  timestamp_seconds: number
  correct_answer: string
  explanation_ar: string | null
  explanation_en: string | null
  is_required: boolean
  allow_retry: boolean
  options: string | null
}

interface QuestionBuilderProps {
  question?: QuestionBuilderQuestion
  onSave: (questionData: QuestionBuilderSaveData) => Promise<void>
  onCancel: () => void
}

function parseOptions(options: RawOptions): string[] {
  if (Array.isArray(options)) {
    return options
  }

  if (typeof options === 'string' && options.length > 0) {
    try {
      const parsed = JSON.parse(options)
      return Array.isArray(parsed) ? parsed.filter((option): option is string => typeof option === 'string') : []
    } catch {
      return []
    }
  }

  return []
}

export default function QuestionBuilder({
  question,
  onSave,
  onCancel
}: QuestionBuilderProps) {
  const [questionType, setQuestionType] = useState<QuestionType>(
    question?.question_type || 'multiple_choice'
  )
  const [questionTextAr, setQuestionTextAr] = useState(question?.question_text_ar || '')
  const [questionTextEn, setQuestionTextEn] = useState(question?.question_text_en || '')
  const [timestampSeconds, setTimestampSeconds] = useState(question?.timestamp_seconds || 0)
  const [correctAnswer, setCorrectAnswer] = useState(question?.correct_answer || '')
  const initialOptions = question ? parseOptions(question.options) : []
  const [options, setOptions] = useState<string[]>(
    initialOptions.length > 0 ? initialOptions : ['', '', '', '']
  )
  const [explanationAr, setExplanationAr] = useState(question?.explanation_ar || '')
  const [explanationEn, setExplanationEn] = useState(question?.explanation_en || '')
  const [isRequired, setIsRequired] = useState(question?.is_required || false)
  const [allowRetry, setAllowRetry] = useState(question?.allow_retry !== false)
  const [isSaving, setIsSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)

    const questionData: QuestionBuilderSaveData = {
      question_type: questionType,
      question_text_ar: questionTextAr,
      question_text_en: questionTextEn,
      timestamp_seconds: timestampSeconds,
      correct_answer: correctAnswer,
      explanation_ar: explanationAr || null,
      explanation_en: explanationEn || null,
      is_required: isRequired,
      allow_retry: allowRetry,
      options: null
    }

    // Add options for multiple choice
    if (questionType === 'multiple_choice') {
      questionData.options = JSON.stringify(options.filter(o => o.trim() !== ''))
    } else {
      questionData.options = null
    }

    try {
      await onSave(questionData)
    } finally {
      setIsSaving(false)
    }
  }

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...options]
    newOptions[index] = value
    setOptions(newOptions)
  }

  const addOption = () => {
    setOptions([...options, ''])
  }

  const removeOption = (index: number) => {
    setOptions(options.filter((_, i) => i !== index))
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-xl font-bold mb-4">
        {question ? 'تعديل سؤال / Edit Question' : 'إضافة سؤال / Add Question'}
      </h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Question Type Selector */}
        <div>
          <label className="block text-sm font-medium mb-2">
            نوع السؤال / Question Type
          </label>
          <select
            value={questionType}
            onChange={(e) => setQuestionType(e.target.value as QuestionType)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="multiple_choice">اختيار متعدد / Multiple Choice</option>
            <option value="true_false">صح أو خطأ / True or False</option>
            <option value="fill_in_blank">املأ الفراغ / Fill in the Blank</option>
          </select>
        </div>

        {/* Timestamp */}
        <div>
          <label className="block text-sm font-medium mb-2">
            التوقيت (بالثواني) / Timestamp (seconds)
          </label>
          <input
            type="number"
            value={timestampSeconds}
            onChange={(e) => setTimestampSeconds(parseInt(e.target.value))}
            min="0"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
          <p className="text-xs text-gray-500 mt-1">
            سيتوقف الفيديو عند هذه النقطة لطرح السؤال
            <br />
            Video will pause at this point to show the question
          </p>
        </div>

        {/* Question Text (Arabic) */}
        <div>
          <label className="block text-sm font-medium mb-2">
            نص السؤال (عربي) / Question Text (Arabic) *
          </label>
          <textarea
            value={questionTextAr}
            onChange={(e) => setQuestionTextAr(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        {/* Question Text (English) */}
        <div>
          <label className="block text-sm font-medium mb-2">
            نص السؤال (إنجليزي) / Question Text (English)
          </label>
          <textarea
            value={questionTextEn}
            onChange={(e) => setQuestionTextEn(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Answer Configuration Based on Type */}
        {questionType === 'multiple_choice' && (
          <div>
            <label className="block text-sm font-medium mb-2">
              الخيارات / Options
            </label>
            <div className="space-y-2">
              {options.map((option, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => handleOptionChange(index, e.target.value)}
                    placeholder={`خيار ${index + 1} / Option ${index + 1}`}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required={index < 2}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setCorrectAnswer(option)
                    }}
                    className={`px-3 py-2 rounded-md ${
                      correctAnswer === option
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                    title="Mark as correct"
                  >
                    ✓
                  </button>
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(index)}
                      className="px-3 py-2 bg-red-100 text-red-600 rounded-md hover:bg-red-200"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            {options.length < 6 && (
              <button
                type="button"
                onClick={addOption}
                className="mt-2 text-sm text-blue-600 hover:text-blue-800"
              >
                + إضافة خيار / Add Option
              </button>
            )}
            <p className="text-xs text-gray-500 mt-2">
              انقر على ✓ لتحديد الإجابة الصحيحة
              <br />
              Click ✓ to mark the correct answer
            </p>
          </div>
        )}

        {questionType === 'true_false' && (
          <div>
            <label className="block text-sm font-medium mb-2">
              الإجابة الصحيحة / Correct Answer
            </label>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setCorrectAnswer('true')}
                className={`flex-1 px-4 py-3 rounded-md font-medium ${
                  correctAnswer === 'true'
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                صح / True
              </button>
              <button
                type="button"
                onClick={() => setCorrectAnswer('false')}
                className={`flex-1 px-4 py-3 rounded-md font-medium ${
                  correctAnswer === 'false'
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                خطأ / False
              </button>
            </div>
          </div>
        )}

        {questionType === 'fill_in_blank' && (
          <div>
            <label className="block text-sm font-medium mb-2">
              الإجابة الصحيحة / Correct Answer
            </label>
            <input
              type="text"
              value={correctAnswer}
              onChange={(e) => setCorrectAnswer(e.target.value)}
              placeholder="اكتب الإجابة الصحيحة / Enter the correct answer"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              ستتم مقارنة إجابة الطالب مع هذه الإجابة (غير حساسة لحالة الأحرف)
              <br />
              Student answer will be compared to this (case-insensitive)
            </p>
          </div>
        )}

        {/* Explanation (Arabic) */}
        <div>
          <label className="block text-sm font-medium mb-2">
            الشرح (عربي) / Explanation (Arabic)
          </label>
          <textarea
            value={explanationAr}
            onChange={(e) => setExplanationAr(e.target.value)}
            rows={2}
            placeholder="شرح اختياري يظهر بعد الإجابة"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Explanation (English) */}
        <div>
          <label className="block text-sm font-medium mb-2">
            الشرح (إنجليزي) / Explanation (English)
          </label>
          <textarea
            value={explanationEn}
            onChange={(e) => setExplanationEn(e.target.value)}
            rows={2}
            placeholder="Optional explanation shown after answering"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Settings */}
        <div className="flex gap-6">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm">
              مطلوب / Required
            </span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allowRetry}
              onChange={(e) => setAllowRetry(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm">
              السماح بإعادة المحاولة / Allow Retry
            </span>
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
            disabled={isSaving}
          >
            إلغاء / Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
            disabled={isSaving || !correctAnswer}
          >
            {isSaving ? 'جاري الحفظ...' : (question ? 'تحديث / Update' : 'إضافة / Add')}
          </button>
        </div>
      </form>
    </div>
  )
}
