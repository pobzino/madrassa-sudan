'use client'

import { useState, useMemo } from 'react'
import type { SortingOrderData } from '@/lib/tasks.types'

interface Props {
  data: SortingOrderData
  language: 'ar' | 'en'
  onSubmit: (responseData: Record<string, unknown>) => void
  disabled: boolean
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export default function SortingOrderTask({ data, language, onSubmit, disabled }: Props) {
  const isAr = language === 'ar'
  const items = data.items || []

  // Shuffle items initially
  const shuffledItems = useMemo(
    () => shuffleArray(items),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const [orderedItems, setOrderedItems] = useState(shuffledItems)

  const moveItem = (index: number, direction: 'up' | 'down') => {
    if (disabled) return
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= orderedItems.length) return
    const copy = [...orderedItems]
    ;[copy[index], copy[newIndex]] = [copy[newIndex], copy[index]]
    setOrderedItems(copy)
  }

  const handleSubmitClick = () => {
    if (disabled) return
    onSubmit({
      ordered_item_ids: orderedItems.map(item => item.id),
    })
  }

  const t = {
    ar: {
      instruction: 'رتّب العناصر بالترتيب الصحيح باستخدام الأسهم',
      submit: 'تحقق',
      ascending: 'رتّب من الأصغر للأكبر',
      descending: 'رتّب من الأكبر للأصغر',
      chronological: 'رتّب حسب التسلسل الزمني',
      custom: 'رتّب بالترتيب الصحيح',
    },
    en: {
      instruction: 'Arrange items in the correct order using the arrows',
      submit: 'Check',
      ascending: 'Sort from smallest to largest',
      descending: 'Sort from largest to smallest',
      chronological: 'Sort in chronological order',
      custom: 'Arrange in the correct order',
    },
  }
  const text = t[language]

  const instructionHint = text[data.instruction_type] || text.custom

  return (
    <div>
      <p className="text-xs text-gray-500 text-center mb-2">{text.instruction}</p>
      <p className="text-xs text-gray-400 text-center mb-4">{instructionHint}</p>

      <div className="space-y-2">
        {orderedItems.map((item, index) => {
          const itemText = isAr ? item.text_ar : (item.text_en || item.text_ar)

          return (
            <div
              key={item.id}
              className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                disabled ? 'opacity-70 border-gray-200 bg-gray-50' : 'border-gray-200 bg-white'
              }`}
            >
              {/* Position number */}
              <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#007229]/10 text-[#007229] flex items-center justify-center text-sm font-bold">
                {index + 1}
              </span>

              {/* Item text */}
              <span className={`flex-1 text-sm font-medium ${isAr ? 'font-cairo' : ''}`}>
                {itemText}
              </span>

              {/* Move buttons */}
              {!disabled && (
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => moveItem(index, 'up')}
                    disabled={index === 0}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    aria-label="Move up"
                  >
                    <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => moveItem(index, 'down')}
                    disabled={index === orderedItems.length - 1}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    aria-label="Move down"
                  >
                    <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Submit button */}
      <button
        onClick={handleSubmitClick}
        disabled={disabled}
        className="mt-5 w-full px-6 py-3 bg-[#007229] text-white rounded-xl hover:bg-[#005C22] font-medium disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        {text.submit}
      </button>
    </div>
  )
}
