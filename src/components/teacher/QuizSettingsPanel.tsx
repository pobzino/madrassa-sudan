'use client'

import { useState, useEffect } from 'react'
import { QuizSettings } from '@/lib/database.types'

interface QuizSettingsPanelProps {
  lessonId: string
  currentSettings: QuizSettings | null
  onSave: (settings: QuizSettings) => Promise<void>
}

export default function QuizSettingsPanel({
  lessonId,
  currentSettings,
  onSave
}: QuizSettingsPanelProps) {
  const [settings, setSettings] = useState<QuizSettings>(
    currentSettings || {
      require_pass_to_continue: false,
      min_pass_questions: 1,
      allow_retries: true,
      max_attempts: null,
      show_explanation: true
    }
  )
  const [isSaving, setIsSaving] = useState(false)
  const [isModified, setIsModified] = useState(false)

  useEffect(() => {
    if (currentSettings) {
      setSettings(currentSettings)
    }
  }, [currentSettings])

  const handleChange = <K extends keyof QuizSettings>(
    key: K,
    value: QuizSettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    setIsModified(true)
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await onSave(settings)
      setIsModified(false)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-xl font-bold mb-4">
        إعدادات الاختبار / Quiz Settings
      </h3>

      <div className="space-y-6">
        {/* Require Pass to Continue */}
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            id="require_pass"
            checked={settings.require_pass_to_continue}
            onChange={(e) =>
              handleChange('require_pass_to_continue', e.target.checked)
            }
            className="mt-1 w-4 h-4"
          />
          <div className="flex-1">
            <label htmlFor="require_pass" className="font-medium cursor-pointer">
              اشتراط اجتياز الاختبار للمتابعة / Require Passing Quiz to Continue
            </label>
            <p className="text-sm text-gray-600 mt-1">
              سيتعين على الطلاب الإجابة بشكل صحيح على الحد الأدنى من الأسئلة قبل إكمال
              الدرس
              <br />
              Students must answer minimum questions correctly before completing the
              lesson
            </p>
          </div>
        </div>

        {/* Minimum Pass Questions */}
        {settings.require_pass_to_continue && (
          <div>
            <label className="block text-sm font-medium mb-2">
              الحد الأدنى من الأسئلة الصحيحة / Minimum Correct Questions
            </label>
            <input
              type="number"
              value={settings.min_pass_questions}
              onChange={(e) =>
                handleChange('min_pass_questions', parseInt(e.target.value))
              }
              min="1"
              className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              عدد الأسئلة التي يجب الإجابة عليها بشكل صحيح لاجتياز الاختبار
              <br />
              Number of questions that must be answered correctly to pass
            </p>
          </div>
        )}

        {/* Allow Retries */}
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            id="allow_retries"
            checked={settings.allow_retries}
            onChange={(e) => handleChange('allow_retries', e.target.checked)}
            className="mt-1 w-4 h-4"
          />
          <div className="flex-1">
            <label htmlFor="allow_retries" className="font-medium cursor-pointer">
              السماح بإعادة المحاولة / Allow Retries
            </label>
            <p className="text-sm text-gray-600 mt-1">
              السماح للطلاب بإعادة محاولة الأسئلة الخاطئة
              <br />
              Allow students to retry questions they answer incorrectly
            </p>
          </div>
        </div>

        {/* Max Attempts */}
        {settings.allow_retries && (
          <div>
            <label className="block text-sm font-medium mb-2">
              الحد الأقصى للمحاولات / Maximum Attempts
            </label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={settings.max_attempts === null}
                  onChange={() => handleChange('max_attempts', null)}
                  className="w-4 h-4"
                />
                <span className="text-sm">
                  غير محدود / Unlimited
                </span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={settings.max_attempts !== null}
                  onChange={() => handleChange('max_attempts', 3)}
                  className="w-4 h-4"
                />
                <span className="text-sm">محدود / Limited:</span>
                {settings.max_attempts !== null && (
                  <input
                    type="number"
                    value={settings.max_attempts}
                    onChange={(e) =>
                      handleChange('max_attempts', parseInt(e.target.value))
                    }
                    min="1"
                    max="10"
                    className="w-16 px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              عدد المحاولات المسموح بها لكل سؤال
              <br />
              Number of attempts allowed per question
            </p>
          </div>
        )}

        {/* Show Explanation */}
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            id="show_explanation"
            checked={settings.show_explanation}
            onChange={(e) => handleChange('show_explanation', e.target.checked)}
            className="mt-1 w-4 h-4"
          />
          <div className="flex-1">
            <label htmlFor="show_explanation" className="font-medium cursor-pointer">
              إظهار الشرح / Show Explanation
            </label>
            <p className="text-sm text-gray-600 mt-1">
              إظهار الشرح للطلاب بعد الإجابة على السؤال
              <br />
              Show explanation to students after they answer
            </p>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t">
          <button
            onClick={handleSave}
            disabled={!isModified || isSaving}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isSaving ? 'جاري الحفظ...' : 'حفظ الإعدادات / Save Settings'}
          </button>
        </div>

        {isModified && !isSaving && (
          <p className="text-sm text-amber-600 text-center">
            لديك تغييرات غير محفوظة / You have unsaved changes
          </p>
        )}
      </div>
    </div>
  )
}
