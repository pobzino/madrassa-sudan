'use client'

import type { SortingOrderData } from '@/lib/tasks.types'

interface Props {
  data: SortingOrderData
  onChange: (data: SortingOrderData) => void
}

export default function SortingOrderEditor({ data, onChange }: Props) {
  const items = data.items || []

  const updateItem = (index: number, updates: Partial<SortingOrderData['items'][0]>) => {
    const next = [...items]
    next[index] = { ...next[index], ...updates }
    onChange({ ...data, items: next })
  }

  const addItem = () => {
    onChange({
      ...data,
      items: [
        ...items,
        { id: crypto.randomUUID(), text_ar: '', text_en: '', correct_position: items.length },
      ],
    })
  }

  const removeItem = (index: number) => {
    const next = items.filter((_, i) => i !== index).map((item, i) => ({
      ...item,
      correct_position: i,
    }))
    onChange({ ...data, items: next })
  }

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= items.length) return
    const next = [...items]
    ;[next[index], next[newIndex]] = [next[newIndex], next[index]]
    // Reassign correct_position based on new order
    const updated = next.map((item, i) => ({ ...item, correct_position: i }))
    onChange({ ...data, items: updated })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-600">Items (in correct order, top = first)</label>
        <select
          value={data.instruction_type || 'custom'}
          onChange={(e) => onChange({ ...data, instruction_type: e.target.value as SortingOrderData['instruction_type'] })}
          className="px-2 py-1 border border-gray-200 rounded-lg text-xs"
        >
          <option value="ascending">Ascending</option>
          <option value="descending">Descending</option>
          <option value="chronological">Chronological</option>
          <option value="custom">Custom</option>
        </select>
      </div>

      {items.map((item, idx) => (
        <div key={item.id} className="flex items-center gap-2">
          <span className="text-xs font-mono text-gray-400 w-5">{idx + 1}.</span>
          <div className="flex-1 space-y-1">
            <input
              value={item.text_ar}
              onChange={(e) => updateItem(idx, { text_ar: e.target.value })}
              placeholder="Item text (Arabic)"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            <input
              value={item.text_en || ''}
              onChange={(e) => updateItem(idx, { text_en: e.target.value })}
              placeholder="Item text (English)"
              className="w-full px-3 py-1.5 border border-gray-100 rounded-lg text-xs text-gray-500"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <button
              onClick={() => moveItem(idx, 'up')}
              disabled={idx === 0}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 text-xs"
            >
              ▲
            </button>
            <button
              onClick={() => moveItem(idx, 'down')}
              disabled={idx === items.length - 1}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 text-xs"
            >
              ▼
            </button>
          </div>
          <button
            onClick={() => removeItem(idx)}
            className="text-red-500 hover:text-red-700 text-xs"
          >
            ✕
          </button>
        </div>
      ))}

      <button
        onClick={addItem}
        className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-emerald-300 hover:text-emerald-600 transition-colors"
      >
        + Add Item
      </button>
    </div>
  )
}
