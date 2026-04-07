'use client';

import { Suspense, useCallback, useState } from 'react';
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
import type { Slide } from '@/lib/slides.types';
import type { ExplorationWidgetType } from '@/lib/explorations/types';
import { EXPLORATION_WIDGETS, WIDGET_LABELS } from '@/lib/explorations/registry';

const ICON_MAP: Record<ExplorationWidgetType, LucideIcon> = {
  number_line: Ruler,
  slider_explore: SlidersHorizontal,
  image_hotspot: MapPin,
  letter_trace: PenTool,
  counting_objects: Hash,
  sorting: ArrowUpDown,
  color_picker: Palette,
};

interface Props {
  slide: Slide;
  language: 'ar' | 'en';
  /** When true, render the live interactive widget. When false (thumbnails), show static preview. */
  interactive?: boolean;
  /** Fired when the student has explored enough. */
  onComplete?: () => void;
}

export default function ExplorationSlide({
  slide,
  language,
  interactive = false,
  onComplete,
}: Props) {
  const widgetType = slide.exploration_widget_type;
  const config = slide.exploration_config;
  const [completed, setCompleted] = useState(false);

  const handleComplete = useCallback(() => {
    setCompleted(true);
    onComplete?.();
  }, [onComplete]);

  if (!widgetType || !config) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-emerald-50 to-white">
        <p className="text-sm text-slate-500">No exploration widget configured</p>
      </div>
    );
  }

  const labels = WIDGET_LABELS[widgetType];
  const title = language === 'ar' ? labels.ar : labels.en;
  const Widget = EXPLORATION_WIDGETS[widgetType];
  const Icon = ICON_MAP[widgetType];

  // Static preview for thumbnails / non-interactive contexts
  if (!interactive || !Widget) {
    const opt = WIDGET_LABELS[widgetType];
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-emerald-50/80 to-white gap-4 p-4">
        <div className="w-20 h-20 rounded-2xl bg-white/80 shadow-sm border border-emerald-200/50 flex items-center justify-center">
          {Icon && <Icon className="w-10 h-10 text-emerald-500" />}
        </div>
        <p className="text-lg font-bold text-emerald-700">
          {language === 'ar' ? opt.ar : opt.en}
        </p>
        <span className="text-xs font-medium text-emerald-500/70 uppercase tracking-wider">
          {language === 'ar' ? 'استكشاف' : 'Exploration'}
        </span>
        <p className="text-xs text-slate-400">
          {language === 'ar' ? 'استكشف!' : 'Explore!'}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-b from-emerald-50/80 to-white animate-[slideEnter_0.4s_ease-out]">
      {/* Header with brand green gradient */}
      <div className="flex items-center justify-between px-6 py-3 bg-gradient-to-r from-[#007229] to-[#00a63e] shrink-0">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-white" />
          <span className="text-sm font-semibold text-white">
            {language === 'ar' ? 'استكشف!' : 'Explore!'}
          </span>
          <span className="text-sm text-white/70">{title}</span>
        </div>
        {completed && (
          <span className="text-sm text-emerald-200 font-bold animate-[bounceText_0.6s_ease-out]">
            {language === 'ar' ? '!أحسنت' : 'Well done!'}
          </span>
        )}
      </div>

      {/* Widget area — centered with entrance animation */}
      <div className="flex-1 flex items-center justify-center px-6 py-4 overflow-auto animate-[widgetEnter_0.5s_ease-out_0.15s_both]">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-12 text-slate-400">
              <svg className="animate-spin h-6 w-6 mr-2" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {language === 'ar' ? 'جاري التحميل...' : 'Loading...'}
            </div>
          }
        >
          <Widget
            config={config}
            language={language}
            onComplete={handleComplete}
          />
        </Suspense>
      </div>

    </div>
  );
}
