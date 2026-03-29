'use client'

import { useLanguage } from '@/contexts/LanguageContext'

interface ProgressGateModalProps {
  questionsCorrect: number
  questionsRequired: number
  onRewatch: () => void
  onClose: () => void
}

export default function ProgressGateModal({
  questionsCorrect,
  questionsRequired,
  onRewatch,
  onClose
}: ProgressGateModalProps) {
  const { language } = useLanguage()

  const t = {
    ar: {
      title: 'يتطلب إكمال الاختبار',
      description: 'يجب عليك الإجابة بشكل صحيح على الحد الأدنى من الأسئلة لإكمال هذا الدرس.',
      current: 'الأسئلة الصحيحة',
      required: 'المطلوب',
      rewatch: 'إعادة مشاهدة الأسئلة',
      close: 'إغلاق'
    },
    en: {
      title: 'Quiz Required',
      description: 'You must answer the minimum number of questions correctly to complete this lesson.',
      current: 'Correct Answers',
      required: 'Required',
      rewatch: 'Rewatch Questions',
      close: 'Close'
    }
  }

  const text = t[language]

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
            <svg className="w-10 h-10 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-center mb-3">
          {text.title}
        </h2>

        {/* Description */}
        <p className="text-gray-600 text-center mb-6">
          {text.description}
        </p>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-[#007229]/5 rounded-xl p-4 text-center">
            <p className="text-sm text-gray-600 mb-1">{text.current}</p>
            <p className="text-3xl font-bold text-[#007229]">{questionsCorrect}</p>
          </div>
          <div className="bg-green-50 rounded-xl p-4 text-center">
            <p className="text-sm text-gray-600 mb-1">{text.required}</p>
            <p className="text-3xl font-bold text-green-600">{questionsRequired}</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#007229] to-[#00913D] transition-all duration-500"
              style={{ width: `${Math.min(100, (questionsCorrect / questionsRequired) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 text-center mt-2">
            {Math.round((questionsCorrect / questionsRequired) * 100)}%
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            onClick={onRewatch}
            className="w-full px-6 py-3 bg-[#007229] text-white rounded-xl hover:bg-[#005C22] font-medium"
          >
            {text.rewatch}
          </button>
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 font-medium"
          >
            {text.close}
          </button>
        </div>
      </div>
    </div>
  )
}
