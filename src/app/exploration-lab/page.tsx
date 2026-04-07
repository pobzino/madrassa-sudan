'use client';

import { useState } from 'react';
import {
  Ruler,
  SlidersHorizontal,
  MapPin,
  PenTool,
  Hash,
  ArrowUpDown,
  Palette,
  Search,
  type LucideIcon,
} from 'lucide-react';
import NumberLineWidget from '@/components/explorations/NumberLineWidget';
import SliderExploreWidget from '@/components/explorations/SliderExploreWidget';
import ImageHotspotWidget from '@/components/explorations/ImageHotspotWidget';
import LetterTraceWidget from '@/components/explorations/LetterTraceWidget';
import CountingObjectsWidget from '@/components/explorations/CountingObjectsWidget';
import SortingWidget from '@/components/explorations/SortingWidget';
import ColorPickerWidget from '@/components/explorations/ColorPickerWidget';
import type {
  NumberLineConfig,
  SliderExploreConfig,
  ImageHotspotConfig,
  LetterTraceConfig,
  CountingObjectsConfig,
  SortingConfig,
  ColorPickerConfig,
} from '@/lib/explorations/types';

const numberLineConfig: NumberLineConfig = {
  type: 'number_line',
  min: 0,
  max: 10,
  target: 7,
  tolerance: 0.5,
  unit_label_ar: 'عدد',
  unit_label_en: 'Number',
};

const sliderConfig: SliderExploreConfig = {
  type: 'slider_explore',
  label_ar: 'درجة الحرارة',
  label_en: 'Temperature',
  min: -20,
  max: 120,
  step: 1,
  initial: 25,
  stages: [
    { threshold: -20, label_ar: 'جليد', label_en: 'Ice', emoji: '1' },
    { threshold: 0, label_ar: 'ماء', label_en: 'Water', emoji: '2' },
    { threshold: 100, label_ar: 'بخار', label_en: 'Steam', emoji: '3' },
  ],
};

const hotspotConfig: ImageHotspotConfig = {
  type: 'image_hotspot',
  image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Sudan_location_map.svg/800px-Sudan_location_map.svg.png',
  hotspots: [
    { x_pct: 50, y_pct: 55, label_ar: 'الخرطوم', label_en: 'Khartoum' },
    { x_pct: 75, y_pct: 30, label_ar: 'بورتسودان', label_en: 'Port Sudan' },
    { x_pct: 25, y_pct: 45, label_ar: 'الفاشر', label_en: 'El Fasher' },
    { x_pct: 55, y_pct: 80, label_ar: 'كوستي', label_en: 'Kosti' },
  ],
};

const letterTraceConfig: LetterTraceConfig = {
  type: 'letter_trace',
  text: 'Hello',
  script: 'en',
  tolerance: 20,
};

const letterTraceArabicConfig: LetterTraceConfig = {
  type: 'letter_trace',
  text: 'ب',
  script: 'ar',
  stroke_paths: [
    {
      points: [
        { x: 160, y: 100 }, { x: 140, y: 98 }, { x: 120, y: 96 },
        { x: 100, y: 95 }, { x: 80, y: 96 }, { x: 60, y: 100 },
        { x: 45, y: 110 }, { x: 40, y: 120 }, { x: 42, y: 130 },
      ],
    },
    { points: [{ x: 100, y: 150 }] },
  ],
  tolerance: 20,
};

const countingConfig: CountingObjectsConfig = {
  type: 'counting_objects',
  objects: [
    { icon: '🍎', x_pct: 20, y_pct: 25, size: 48 },
    { icon: '🍎', x_pct: 55, y_pct: 40, size: 48 },
    { icon: '🍎', x_pct: 75, y_pct: 30, size: 48 },
    { icon: '🍎', x_pct: 35, y_pct: 65, size: 48 },
    { icon: '🍎', x_pct: 65, y_pct: 70, size: 48 },
  ],
  target_count: 5,
};

const sortingConfig: SortingConfig = {
  type: 'sorting',
  categories: [
    { label_en: 'Fruits', label_ar: 'فواكه', color: '#22c55e' },
    { label_en: 'Vegetables', label_ar: 'خضروات', color: '#f97316' },
  ],
  items: [
    { label_en: 'Apple', label_ar: 'تفاحة', correct_category: 0 },
    { label_en: 'Carrot', label_ar: 'جزرة', correct_category: 1 },
    { label_en: 'Banana', label_ar: 'موزة', correct_category: 0 },
    { label_en: 'Broccoli', label_ar: 'بروكلي', correct_category: 1 },
    { label_en: 'Orange', label_ar: 'برتقالة', correct_category: 0 },
  ],
};

const colorPickerConfig: ColorPickerConfig = {
  type: 'color_picker',
  target_color: '#FF6B35',
  tolerance: 30,
};

type WidgetKey = 'number_line' | 'slider_explore' | 'image_hotspot' | 'letter_trace' | 'letter_trace_ar' | 'counting_objects' | 'sorting' | 'color_picker';

const WIDGETS: { key: WidgetKey; label: string; Icon: LucideIcon }[] = [
  { key: 'number_line', label: 'Number Line', Icon: Ruler },
  { key: 'slider_explore', label: 'Slider Explore', Icon: SlidersHorizontal },
  { key: 'image_hotspot', label: 'Image Hotspot', Icon: MapPin },
  { key: 'letter_trace', label: 'Trace (EN)', Icon: PenTool },
  { key: 'letter_trace_ar', label: 'Trace (AR)', Icon: PenTool },
  { key: 'counting_objects', label: 'Counting', Icon: Hash },
  { key: 'sorting', label: 'Sorting', Icon: ArrowUpDown },
  { key: 'color_picker', label: 'Color Mixer', Icon: Palette },
];

export default function ExplorationLabPage() {
  const [active, setActive] = useState<WidgetKey>('number_line');
  const [completed, setCompleted] = useState<Set<WidgetKey>>(new Set());
  const [key, setKey] = useState(0);

  const handleComplete = () => {
    setCompleted((prev) => new Set(prev).add(active));
  };

  const handleReset = () => {
    setCompleted((prev) => {
      const next = new Set(prev);
      next.delete(active);
      return next;
    });
    setKey((k) => k + 1);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">Exploration Widget Lab</h1>
        <p className="text-sm text-slate-500 mb-6">Test all 7 exploration widgets standalone</p>

        {/* Tab bar */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {WIDGETS.map((w) => {
            const WIcon = w.Icon;
            return (
              <button
                key={w.key}
                onClick={() => { setActive(w.key); setKey((k) => k + 1); }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  active === w.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <WIcon className="w-4 h-4" />
                {w.label}
                {completed.has(w.key) && <span className="ml-1 text-emerald-300">&#10003;</span>}
              </button>
            );
          })}
        </div>

        {/* Widget area */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-blue-600">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-white" />
              <span className="text-sm font-semibold text-white">Explore!</span>
            </div>
            <div className="flex items-center gap-2">
              {completed.has(active) && (
                <span className="text-sm text-emerald-300 font-medium">Completed!</span>
              )}
              <button
                onClick={handleReset}
                className="text-xs text-white/70 hover:text-white px-2 py-1 rounded"
              >
                Reset
              </button>
            </div>
          </div>

          <div className="p-6" key={key}>
            {active === 'number_line' && (
              <NumberLineWidget config={numberLineConfig} language="en" onComplete={handleComplete} />
            )}
            {active === 'slider_explore' && (
              <SliderExploreWidget config={sliderConfig} language="en" onComplete={handleComplete} />
            )}
            {active === 'image_hotspot' && (
              <ImageHotspotWidget config={hotspotConfig} language="en" onComplete={handleComplete} />
            )}
            {active === 'letter_trace' && (
              <LetterTraceWidget config={letterTraceConfig} language="en" onComplete={handleComplete} />
            )}
            {active === 'letter_trace_ar' && (
              <LetterTraceWidget config={letterTraceArabicConfig} language="ar" onComplete={handleComplete} />
            )}
            {active === 'counting_objects' && (
              <CountingObjectsWidget config={countingConfig} language="en" onComplete={handleComplete} />
            )}
            {active === 'sorting' && (
              <SortingWidget config={sortingConfig} language="en" onComplete={handleComplete} />
            )}
            {active === 'color_picker' && (
              <ColorPickerWidget config={colorPickerConfig} language="en" onComplete={handleComplete} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
