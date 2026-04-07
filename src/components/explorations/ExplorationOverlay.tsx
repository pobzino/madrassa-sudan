'use client';

import { Suspense, useCallback, useState } from 'react';
import { Search } from 'lucide-react';
import type { ExplorationWidgetType, ExplorationWidgetConfig } from '@/lib/explorations/types';
import { EXPLORATION_WIDGETS, WIDGET_LABELS } from '@/lib/explorations/registry';

interface ExplorationOverlayProps {
  widgetType: ExplorationWidgetType;
  config: ExplorationWidgetConfig;
  language: 'ar' | 'en';
  onContinue: () => void;
}

export default function ExplorationOverlay({
  widgetType,
  config,
  language,
  onContinue,
}: ExplorationOverlayProps) {
  const [canContinue, setCanContinue] = useState(false);

  const handleComplete = useCallback(() => {
    setCanContinue(true);
  }, []);

  const Widget = EXPLORATION_WIDGETS[widgetType];
  const labels = WIDGET_LABELS[widgetType];
  const title = language === 'ar' ? labels.ar : labels.en;

  if (!Widget) {
    return (
      <div className="px-4 py-3 bg-amber-50 text-amber-700 text-sm">
        Unknown exploration widget: {widgetType}
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-b from-blue-50 to-white border-t border-blue-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-blue-600">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-white" />
          <span className="text-sm font-semibold text-white">
            {language === 'ar' ? 'استكشف!' : 'Explore!'}
          </span>
          <span className="text-sm text-white/70">{title}</span>
        </div>
        {canContinue && (
          <button
            type="button"
            onClick={onContinue}
            className="flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-sm font-bold text-blue-600 shadow transition-transform hover:scale-105 active:scale-100 animate-in fade-in slide-in-from-right-2"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            {language === 'ar' ? 'متابعة' : 'Continue'}
          </button>
        )}
      </div>

      {/* Widget area */}
      <div className="px-4 py-6">
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
