'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import QuestionBuilder from '@/components/teacher/QuestionBuilder'
import QuizSettingsPanel from '@/components/teacher/QuizSettingsPanel'
import type { Database, QuizSettings } from '@/lib/database.types'

type QuestionType = Database['public']['Enums']['question_type']
type QuestionOptions = string[] | string | null

type QuestionSaveData = {
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

type TeacherLessonResponse = {
  lesson: Lesson
}

type TeacherLessonQuestionsResponse = {
  questions: Question[]
}

type ErrorResponse = {
  error?: string
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

interface Question {
  id: string
  question_text_ar: string
  question_text_en: string | null
  question_type: QuestionType
  timestamp_seconds: number
  correct_answer: string
  options: QuestionOptions
  explanation_ar: string | null
  explanation_en: string | null
  display_order: number
  is_required: boolean
  allow_retry: boolean
}

interface Lesson {
  id: string
  title_ar: string
  title_en: string
  quiz_settings: QuizSettings | null
}

export default function TeacherQuizzesPage() {
  const params = useParams()
  const router = useRouter()
  const lessonId = params.id as string

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      // Fetch lesson details
      const lessonRes = await fetch(`/api/teacher/lessons/${lessonId}`)
      if (!lessonRes.ok) throw new Error('Failed to fetch lesson')
      const lessonData = (await lessonRes.json()) as TeacherLessonResponse
      setLesson(lessonData.lesson)

      // Fetch questions
      const questionsRes = await fetch(`/api/teacher/lessons/${lessonId}/questions`)
      if (!questionsRes.ok) throw new Error('Failed to fetch questions')
      const questionsData = (await questionsRes.json()) as TeacherLessonQuestionsResponse
      setQuestions(questionsData.questions || [])
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to fetch quiz data'))
    } finally {
      setIsLoading(false)
    }
  }, [lessonId])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const handleCreateQuestion = async (questionData: QuestionSaveData) => {
    try {
      const res = await fetch(`/api/teacher/lessons/${lessonId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...questionData,
          display_order: questions.length + 1
        })
      })

      if (!res.ok) {
        const error = (await res.json()) as ErrorResponse
        throw new Error(error.error || 'Failed to create question')
      }

      await fetchData()
      setIsCreating(false)
    } catch (err: unknown) {
      alert(getErrorMessage(err, 'Failed to create question'))
    }
  }

  const handleUpdateQuestion = async (questionData: QuestionSaveData) => {
    if (!editingQuestion) return

    try {
      const res = await fetch(
        `/api/teacher/lessons/${lessonId}/questions?questionId=${editingQuestion.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(questionData)
        }
      )

      if (!res.ok) {
        const error = (await res.json()) as ErrorResponse
        throw new Error(error.error || 'Failed to update question')
      }

      await fetchData()
      setEditingQuestion(null)
    } catch (err: unknown) {
      alert(getErrorMessage(err, 'Failed to update question'))
    }
  }

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا السؤال؟\nAre you sure you want to delete this question?')) {
      return
    }

    try {
      const res = await fetch(
        `/api/teacher/lessons/${lessonId}/questions?questionId=${questionId}`,
        {
          method: 'DELETE'
        }
      )

      if (!res.ok) {
        const error = (await res.json()) as ErrorResponse
        throw new Error(error.error || 'Failed to delete question')
      }

      await fetchData()
    } catch (err: unknown) {
      alert(getErrorMessage(err, 'Failed to delete question'))
    }
  }

  const handleSaveQuizSettings = async (settings: QuizSettings) => {
    try {
      const res = await fetch(`/api/teacher/lessons/${lessonId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quiz_settings: settings })
      })

      if (!res.ok) {
        const error = (await res.json()) as ErrorResponse
        throw new Error(error.error || 'Failed to save settings')
      }

      await fetchData()
    } catch (err: unknown) {
      alert(getErrorMessage(err, 'Failed to save settings'))
    }
  }

  const formatTimestamp = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getQuestionTypeLabel = (type: string) => {
    switch (type) {
      case 'multiple_choice':
        return 'اختيار متعدد / Multiple Choice'
      case 'true_false':
        return 'صح/خطأ / True/False'
      case 'fill_in_blank':
        return 'املأ الفراغ / Fill Blank'
      default:
        return type
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">جاري التحميل... / Loading...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
          خطأ / Error: {error}
        </div>
      </div>
    )
  }

  if (!lesson) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800">
          الدرس غير موجود / Lesson not found
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="text-blue-600 hover:text-blue-800 mb-4 flex items-center gap-2"
        >
          ← رجوع / Back
        </button>
        <h1 className="text-3xl font-bold mb-2">
          إدارة أسئلة الاختبار / Manage Quiz Questions
        </h1>
        <p className="text-gray-600">
          {lesson.title_ar} / {lesson.title_en}
        </p>
      </div>

      {/* Quiz Settings Panel */}
      <div className="mb-8">
        <QuizSettingsPanel
          lessonId={lessonId}
          currentSettings={lesson.quiz_settings}
          onSave={handleSaveQuizSettings}
        />
      </div>

      {/* Questions List */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">
            الأسئلة ({questions.length}) / Questions ({questions.length})
          </h2>
          {!isCreating && !editingQuestion && (
            <button
              onClick={() => setIsCreating(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              + إضافة سؤال / Add Question
            </button>
          )}
        </div>

        {/* Create/Edit Form */}
        {(isCreating || editingQuestion) && (
          <div className="mb-6">
            <QuestionBuilder
              question={editingQuestion ?? undefined}
              onSave={editingQuestion ? handleUpdateQuestion : handleCreateQuestion}
              onCancel={() => {
                setIsCreating(false)
                setEditingQuestion(null)
              }}
            />
          </div>
        )}

        {/* Questions List */}
        {questions.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
            <p className="text-gray-600 mb-4">
              لا توجد أسئلة حتى الآن
              <br />
              No questions added yet
            </p>
            {!isCreating && (
              <button
                onClick={() => setIsCreating(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                + إضافة أول سؤال / Add First Question
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {questions.map((question, index) => (
              <div
                key={question.id}
                className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl font-bold text-gray-300">
                        {index + 1}
                      </span>
                      <div>
                        <span className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                          {getQuestionTypeLabel(question.question_type)}
                        </span>
                        <span className="inline-block px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded ml-2">
                          ⏱ {formatTimestamp(question.timestamp_seconds)}
                        </span>
                        {question.is_required && (
                          <span className="inline-block px-2 py-1 text-xs bg-red-100 text-red-800 rounded ml-2">
                            مطلوب / Required
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-lg font-medium mb-1">
                      {question.question_text_ar}
                    </p>
                    {question.question_text_en && (
                      <p className="text-gray-600 mb-2">
                        {question.question_text_en}
                      </p>
                    )}
                    <p className="text-sm text-gray-500">
                      إجابة صحيحة / Correct Answer:{' '}
                      <span className="font-medium">{question.correct_answer}</span>
                    </p>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => setEditingQuestion(question)}
                      className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                    >
                      تعديل / Edit
                    </button>
                    <button
                      onClick={() => handleDeleteQuestion(question.id)}
                      className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                    >
                      حذف / Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
