'use client'

import type { MatchingPairsData } from '@/lib/tasks.types'

interface Props {
  data: MatchingPairsData
  onChange: (data: MatchingPairsData) => void
}

export default function MatchingPairsEditor({ data, onChange }: Props) {
  const pairs = data.pairs || []

  const updatePair = (index: number, updates: Partial<MatchingPairsData['pairs'][0]>) => {
    const next = [...pairs]
    next[index] = { ...next[index], ...updates }
    onChange({ ...data, pairs: next })
  }

  const addPair = () => {
    onChange({
      ...data,
      pairs: [...pairs, { id: crypto.randomUUID(), left_ar: '', left_en: '', right_ar: '', right_en: '' }],
    })
  }

  const removePair = (index: number) => {
    onChange({ ...data, pairs: pairs.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-600">Matching Pairs</label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={data.shuffle_right ?? true}
            onChange={(e) => onChange({ ...data, shuffle_right: e.target.checked })}
          />
          Shuffle right column
        </label>
      </div>

      {pairs.map((pair, idx) => (
        <div key={pair.id} className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-start">
          <div className="space-y-1">
            <input
              value={pair.left_ar}
              onChange={(e) => updatePair(idx, { left_ar: e.target.value })}
              placeholder="Left (Arabic)"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            <input
              value={pair.left_en || ''}
              onChange={(e) => updatePair(idx, { left_en: e.target.value })}
              placeholder="Left (English)"
              className="w-full px-3 py-1.5 border border-gray-100 rounded-lg text-xs text-gray-500"
            />
          </div>
          <span className="text-gray-400 self-center">↔</span>
          <div className="space-y-1">
            <input
              value={pair.right_ar}
              onChange={(e) => updatePair(idx, { right_ar: e.target.value })}
              placeholder="Right (Arabic)"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            <input
              value={pair.right_en || ''}
              onChange={(e) => updatePair(idx, { right_en: e.target.value })}
              placeholder="Right (English)"
              className="w-full px-3 py-1.5 border border-gray-100 rounded-lg text-xs text-gray-500"
            />
          </div>
          <button
            onClick={() => removePair(idx)}
            className="text-red-500 hover:text-red-700 text-xs self-center"
          >
            ✕
          </button>
        </div>
      ))}

      <button
        onClick={addPair}
        className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-emerald-300 hover:text-emerald-600 transition-colors"
      >
        + Add Pair
      </button>
    </div>
  )
}
