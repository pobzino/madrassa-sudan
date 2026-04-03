'use client';

import { useState } from 'react';
import type { SlideType, SlideInteractionType } from '@/lib/slides.types';
import { ACTIVITY_TYPE_OPTIONS } from '@/lib/lesson-activities';

export interface InteractiveSlideRequest {
  interactionType: SlideInteractionType;
  slideType: 'activity' | 'quiz_preview';
}

interface SlideToolbarProps {
  language: 'ar' | 'en';
  onLanguageChange: (lang: 'ar' | 'en') => void;
  onAddSlide: (type: SlideType) => void;
  onAddInteractiveSlide: (request: InteractiveSlideRequest) => void;
  onSave: () => void;
  onPresent: () => void;
  onRecord?: () => void;
  saving: boolean;
}

export default function SlideToolbar({
  language,
  onLanguageChange,
  onAddSlide,
  onAddInteractiveSlide,
  onSave,
  onPresent,
  onRecord,
  saving,
}: SlideToolbarProps) {
  const [showInteractivePicker, setShowInteractivePicker] = useState(false);

  return (
    <>
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

          {/* Add Interactive Slide — dedicated button */}
          <button
            onClick={() => setShowInteractivePicker(true)}
            className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
            </svg>
            + Interactive
          </button>

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

      {/* Interactive slide picker modal */}
      {showInteractivePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowInteractivePicker(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">Add Interactive Slide</h3>
              <p className="text-sm text-gray-500 mt-0.5">Pick an activity type — the slide and interaction will be set up for you.</p>
            </div>
            <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
              {ACTIVITY_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.type}
                  onClick={() => {
                    onAddInteractiveSlide({ interactionType: opt.type, slideType: 'activity' });
                    setShowInteractivePicker(false);
                  }}
                  className="w-full flex items-start gap-3 px-4 py-3 rounded-xl border border-gray-100 hover:border-amber-300 hover:bg-amber-50/50 transition-all text-left group"
                >
                  <span className="text-2xl flex-shrink-0 mt-0.5">{opt.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 group-hover:text-amber-800">{opt.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{opt.hint}</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-300 group-hover:text-amber-500 flex-shrink-0 mt-1 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </button>
              ))}
            </div>
            <div className="px-6 py-3 border-t border-gray-100 bg-gray-50">
              <button
                onClick={() => setShowInteractivePicker(false)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
