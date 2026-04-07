'use client';

import { useCallback, useRef, useState } from 'react';
import type { ExplorationWidgetProps, SortingConfig } from '@/lib/explorations/types';

interface PlacedItem {
  itemIndex: number;
  categoryIndex: number;
  correct: boolean;
}

export default function SortingWidget({
  config,
  language,
  onComplete,
}: ExplorationWidgetProps<SortingConfig>) {
  const { categories, items } = config;
  const [placed, setPlaced] = useState<PlacedItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<number | null>(null);
  const [shakeCategory, setShakeCategory] = useState<number | null>(null);
  const [completed, setCompleted] = useState(false);
  const [justPlaced, setJustPlaced] = useState<number | null>(null);
  const completedRef = useRef(false);

  const placedIndices = new Set(placed.map((p) => p.itemIndex));
  const unplacedItems = items.map((item, i) => ({ item, index: i })).filter(({ index }) => !placedIndices.has(index));

  const handleSelectItem = useCallback((index: number) => {
    if (completedRef.current) return;
    setSelectedItem((prev) => (prev === index ? null : index));
  }, []);

  const handleDropInCategory = useCallback(
    (categoryIndex: number) => {
      if (completedRef.current || selectedItem === null) return;

      const item = items[selectedItem];
      const correct = item.correct_category === categoryIndex;

      if (!correct) {
        setShakeCategory(categoryIndex);
        setTimeout(() => setShakeCategory(null), 500);
        return;
      }

      const newPlaced: PlacedItem = { itemIndex: selectedItem, categoryIndex, correct: true };
      const nextPlaced = [...placed, newPlaced];
      setPlaced(nextPlaced);
      setJustPlaced(selectedItem);
      setTimeout(() => setJustPlaced(null), 400);
      setSelectedItem(null);

      if (nextPlaced.length === items.length) {
        completedRef.current = true;
        setCompleted(true);
        setTimeout(() => onComplete(), 600);
      }
    },
    [selectedItem, items, placed, onComplete]
  );

  const handleReset = useCallback(() => {
    if (completedRef.current) return;
    setPlaced([]);
    setSelectedItem(null);
  }, []);

  const getItemsInCategory = (catIndex: number) =>
    placed.filter((p) => p.categoryIndex === catIndex).map((p) => ({ ...items[p.itemIndex], placedIndex: p.itemIndex }));

  return (
    <div className="flex flex-col gap-4 w-full max-w-lg mx-auto px-4 rounded-2xl bg-gradient-to-b from-amber-50/60 to-white py-6">
      {/* Category buckets */}
      <div className="flex gap-3">
        {categories.map((cat, ci) => {
          const isShaking = shakeCategory === ci;
          const catItems = getItemsInCategory(ci);
          return (
            <button
              key={ci}
              type="button"
              onClick={() => handleDropInCategory(ci)}
              className={`flex-1 min-h-[110px] rounded-2xl border-2 border-dashed p-3 transition-all ${
                selectedItem !== null
                  ? 'border-blue-400 bg-blue-50 cursor-pointer hover:bg-blue-100 hover:scale-[1.02]'
                  : 'border-slate-200 bg-slate-50/80 cursor-default'
              } ${isShaking ? 'animate-[shake_0.3s_ease-in-out]' : ''}`}
              style={{
                borderColor: selectedItem !== null ? cat.color : undefined,
                background: selectedItem === null ? `linear-gradient(180deg, ${cat.color}08, ${cat.color}15)` : undefined,
              }}
            >
              <p
                className="text-sm font-bold text-center mb-2"
                style={{ color: cat.color }}
              >
                {language === 'ar' ? cat.label_ar : cat.label_en}
              </p>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {catItems.map((item, ii) => (
                  <span
                    key={ii}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium bg-white shadow-sm border transition-all ${
                      justPlaced === item.placedIndex ? 'animate-[snapIn_0.3s_ease-out]' : ''
                    }`}
                    style={{ borderColor: cat.color, color: cat.color }}
                  >
                    {language === 'ar' ? item.label_ar : item.label_en}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* Unplaced items pool */}
      {unplacedItems.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center p-3 bg-white rounded-2xl border border-slate-200 shadow-sm">
          {unplacedItems.map(({ item, index }) => (
            <button
              key={index}
              type="button"
              onClick={() => handleSelectItem(index)}
              disabled={completed}
              className={`min-w-[44px] min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                selectedItem === index
                  ? 'bg-blue-600 text-white shadow-lg scale-105 -rotate-1'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:rotate-1'
              }`}
            >
              {language === 'ar' ? item.label_ar : item.label_en}
            </button>
          ))}
        </div>
      )}

      {/* Status / instructions */}
      <div className="flex items-center justify-center gap-3">
        {completed ? (
          <div className="flex flex-col items-center gap-1 animate-[bounceIn_0.5s_ease-out]">
            <span className="text-3xl animate-[scaleIn_0.4s_ease-out]">&#10003;</span>
            <p className="text-sm font-bold text-emerald-600 animate-[bounceText_0.6s_ease-out]">
              {language === 'ar' ? 'أحسنت! تم التصنيف' : 'All sorted correctly!'}
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-500">
              {selectedItem !== null
                ? language === 'ar'
                  ? '👆 اختر الفئة المناسبة'
                  : '👆 Now tap the correct category'
                : language === 'ar'
                  ? '👇 اختر عنصراً ثم ضعه في الفئة'
                  : '👇 Tap an item, then tap its category'}
            </p>
            {placed.length > 0 && (
              <button
                type="button"
                onClick={handleReset}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 transition-colors min-h-[36px]"
              >
                {language === 'ar' ? 'إعادة' : 'Reset'}
              </button>
            )}
          </>
        )}
      </div>

      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-6px); }
          75% { transform: translateX(6px); }
        }
        @keyframes snapIn {
          0% { transform: scale(0.5); opacity: 0; }
          70% { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes bounceIn {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes scaleIn {
          0% { transform: scale(0); }
          70% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }
        @keyframes bounceText {
          0% { transform: translateY(10px); opacity: 0; }
          60% { transform: translateY(-4px); }
          100% { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
