'use client'

import { useState, useMemo } from 'react'
import type { MatchingPairsData } from '@/lib/tasks.types'

interface Props {
  data: MatchingPairsData
  language: 'ar' | 'en'
  onSubmit: (responseData: Record<string, unknown>) => void
  disabled: boolean
}

// Deterministic shuffle based on array content
function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const PAIR_COLORS = [
  { bg: 'bg-emerald-100', border: 'border-emerald-400', text: 'text-emerald-700' },
  { bg: 'bg-blue-100', border: 'border-blue-400', text: 'text-blue-700' },
  { bg: 'bg-purple-100', border: 'border-purple-400', text: 'text-purple-700' },
  { bg: 'bg-amber-100', border: 'border-amber-400', text: 'text-amber-700' },
  { bg: 'bg-pink-100', border: 'border-pink-400', text: 'text-pink-700' },
  { bg: 'bg-cyan-100', border: 'border-cyan-400', text: 'text-cyan-700' },
  { bg: 'bg-red-100', border: 'border-red-400', text: 'text-red-700' },
  { bg: 'bg-indigo-100', border: 'border-indigo-400', text: 'text-indigo-700' },
]

export default function MatchingPairsTask({ data, language, onSubmit, disabled }: Props) {
  const isAr = language === 'ar'
  const pairs = data.pairs || []

  // Shuffle right-side items once
  const shuffledRight = useMemo(
    () => data.shuffle_right ? shuffleArray(pairs) : pairs,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  // Track matches: left_id -> right pair id
  const [matches, setMatches] = useState<Map<string, string>>(new Map())
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null)

  const matchedLeftIds = new Set(matches.keys())
  const matchedRightIds = new Set(matches.values())

  // Get color index for a matched pair
  const getMatchColor = (pairId: string) => {
    const matchEntries = Array.from(matches.entries())
    const idx = matchEntries.findIndex(([leftId]) => leftId === pairId || matches.get(leftId) === pairId)
    return PAIR_COLORS[idx % PAIR_COLORS.length]
  }

  const handleLeftTap = (leftId: string) => {
    if (disabled) return
    if (matchedLeftIds.has(leftId)) {
      // Unmatch
      const newMatches = new Map(matches)
      newMatches.delete(leftId)
      setMatches(newMatches)
      setSelectedLeft(null)
      return
    }
    setSelectedLeft(leftId === selectedLeft ? null : leftId)
  }

  const handleRightTap = (rightId: string) => {
    if (disabled || !selectedLeft) return
    if (matchedRightIds.has(rightId)) {
      // Unmatch this right item first
      const newMatches = new Map(matches)
      for (const [k, v] of newMatches) {
        if (v === rightId) { newMatches.delete(k); break }
      }
      newMatches.set(selectedLeft, rightId)
      setMatches(newMatches)
    } else {
      const newMatches = new Map(matches)
      newMatches.set(selectedLeft, rightId)
      setMatches(newMatches)
    }
    setSelectedLeft(null)
  }

  const allMatched = matches.size === pairs.length
  const canSubmit = allMatched && !disabled

  const handleSubmitClick = () => {
    if (!canSubmit) return
    const matchArray = Array.from(matches.entries()).map(([left_id, right_id]) => ({
      left_id,
      right_id,
    }))
    onSubmit({ matches: matchArray })
  }

  const t = {
    ar: { tapLeft: 'اضغط على عنصر من اليمين ثم وصّله بعنصر من اليسار', submit: 'تحقق', matched: 'تم التوصيل' },
    en: { tapLeft: 'Tap an item on the left, then tap its match on the right', submit: 'Check', matched: 'matched' },
  }
  const text = t[language]

  return (
    <div>
      <p className="text-xs text-gray-500 text-center mb-4">{text.tapLeft}</p>

      <div className="grid grid-cols-2 gap-3">
        {/* Left column */}
        <div className="space-y-2">
          {pairs.map((pair) => {
            const isMatched = matchedLeftIds.has(pair.id)
            const isSelected = selectedLeft === pair.id
            const color = isMatched ? getMatchColor(pair.id) : null

            return (
              <button
                key={`left-${pair.id}`}
                onClick={() => handleLeftTap(pair.id)}
                disabled={disabled}
                className={`w-full px-3 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                  isSelected
                    ? 'border-[#007229] bg-[#007229]/10 ring-2 ring-[#007229]/30 scale-[1.02]'
                    : isMatched && color
                    ? `${color.border} ${color.bg} ${color.text}`
                    : 'border-gray-200 bg-white hover:border-gray-300'
                } ${disabled ? 'opacity-70 cursor-default' : 'cursor-pointer'}`}
              >
                {isAr ? pair.left_ar : (pair.left_en || pair.left_ar)}
                {isMatched && (
                  <span className="ml-1 text-xs opacity-60">✓</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Right column */}
        <div className="space-y-2">
          {shuffledRight.map((pair) => {
            const isMatched = matchedRightIds.has(pair.id)
            const color = isMatched ? getMatchColor(pair.id) : null
            const isTargetable = selectedLeft && !isMatched

            return (
              <button
                key={`right-${pair.id}`}
                onClick={() => handleRightTap(pair.id)}
                disabled={disabled || !selectedLeft}
                className={`w-full px-3 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                  isMatched && color
                    ? `${color.border} ${color.bg} ${color.text}`
                    : isTargetable
                    ? 'border-dashed border-[#007229]/40 bg-[#007229]/5 hover:border-[#007229] cursor-pointer'
                    : 'border-gray-200 bg-white'
                } ${disabled ? 'opacity-70 cursor-default' : ''}`}
              >
                {isAr ? pair.right_ar : (pair.right_en || pair.right_ar)}
                {isMatched && (
                  <span className="ml-1 text-xs opacity-60">✓</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Submit button */}
      <button
        onClick={handleSubmitClick}
        disabled={!canSubmit}
        className="mt-5 w-full px-6 py-3 bg-[#007229] text-white rounded-xl hover:bg-[#005C22] font-medium disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        {text.submit}
      </button>
    </div>
  )
}
