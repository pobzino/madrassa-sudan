'use client';

import type { SlideType } from '@/lib/slides.types';

interface SlideToolbarProps {
  language: 'ar' | 'en';
  onLanguageChange: (lang: 'ar' | 'en') => void;
  onAddSlide: (type: SlideType) => void;
  onSave: () => void;
  onPresent: () => void;
  onRecord?: () => void;
  saving: boolean;
}

export default function SlideToolbar({
  language,
  onLanguageChange,
  onAddSlide,
  onSave,
  onPresent,
  onRecord,
  saving,
}: SlideToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white border-b border-gray-100">
      {/* Language toggle */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
        <button
          onClick={() => onLanguageChange('ar')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            language === 'ar' ? 'bg-white text-[#007229] shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          عربي
        </button>
        <button
          onClick={() => onLanguageChange('en')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            language === 'en' ? 'bg-white text-[#007229] shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          EN
        </button>
      </div>

      <div className="flex items-center gap-2">
        {/* Add slide dropdown */}
        <div className="relative group">
          <button className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Slide
          </button>
          <div className="hidden group-hover:block absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-20 min-w-[160px]">
            {[
              { type: 'content' as SlideType, label: 'Content' },
              { type: 'key_points' as SlideType, label: 'Key Points' },
              { type: 'diagram_description' as SlideType, label: 'Diagram' },
              { type: 'activity' as SlideType, label: 'Activity' },
              { type: 'quiz_preview' as SlideType, label: 'Quiz Preview' },
              { type: 'question_answer' as SlideType, label: 'Q&A Reveal' },
              { type: 'summary' as SlideType, label: 'Summary' },
            ].map((item) => (
              <button
                key={item.type}
                onClick={() => onAddSlide(item.type)}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Record */}
        {onRecord && (
          <button
            onClick={onRecord}
            className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="8" />
            </svg>
            Record
          </button>
        )}

        {/* Present */}
        <button
          onClick={onPresent}
          className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
          </svg>
          Present
        </button>

        {/* Save */}
        <button
          onClick={onSave}
          disabled={saving}
          className="px-4 py-1.5 text-xs font-medium text-white bg-[#007229] rounded-lg hover:bg-[#005C22] transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
