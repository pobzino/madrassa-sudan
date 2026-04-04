import type { Slide } from '@/lib/slides.types';
import { getSlideBodyClasses, getSlideTitleClasses } from '../slideText';
import { Lightbulb } from 'lucide-react';

interface Props {
  slide: Slide;
  language: 'ar' | 'en';
  revealedCount?: number;
  onReveal?: () => void;
}

export default function QuestionAnswerSlide({ slide, language, revealedCount, onReveal }: Props) {
  const isAr = language === 'ar';
  const title = isAr ? slide.title_ar : slide.title_en;
  const body = isAr ? slide.body_ar : slide.body_en;
  const items = (isAr ? slide.reveal_items_ar : slide.reveal_items_en) || [];
  const isInteractive = revealedCount !== undefined;

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="relative w-full h-full bg-gradient-to-br from-teal-50 via-white to-emerald-50 flex flex-col items-center p-8 sm:p-12 overflow-y-auto"
      style={{ justifyContent: 'safe center' }}
    >
      {/* Teal accent top */}
      <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-teal-500 via-emerald-400 to-teal-600" />

      {/* Decorative circles */}
      <div className="absolute top-[-30px] right-[-30px] w-[120px] h-[120px] rounded-full bg-teal-500/5" />
      <div className="absolute bottom-[-40px] left-[-40px] w-[160px] h-[160px] rounded-full bg-emerald-200/30" />

      {/* Floating icons */}
      <span className="absolute top-[15%] left-[8%] text-2xl text-teal-500/15 font-fredoka font-bold">?</span>
      <span className="absolute top-[20%] right-[10%] text-lg text-emerald-300/30 font-fredoka font-bold">!</span>
      <span className="absolute bottom-[25%] left-[12%] text-xl text-teal-500/10 font-fredoka font-bold">?</span>

      {/* Badge */}
      <span className="relative z-10 inline-block px-5 py-2 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-full text-xs sm:text-sm font-bold mb-3 sm:mb-4 shadow-md">
        <Lightbulb className="inline w-4 h-4" /> {isAr ? 'سؤال وجواب' : 'Q&A Reveal'}
      </span>

      {/* Question (title) */}
      <h2 className={`relative z-10 font-fredoka font-bold text-gray-900 text-center mb-2 sm:mb-3 ${getSlideTitleClasses(slide.title_size)} ${isAr ? 'font-cairo' : ''}`}>
        {title}
      </h2>

      {/* Question body */}
      {body && (
        <p className={`relative z-10 text-gray-600 text-center mb-4 sm:mb-6 max-w-[85%] ${getSlideBodyClasses(slide.body_size, 'compact')} ${isAr ? 'font-cairo' : 'font-inter'}`}>
          {body}
        </p>
      )}

      {/* Reveal items */}
      {items.length > 0 && (
        <div className="relative z-10 w-full max-w-[85%] flex flex-wrap items-center justify-center gap-3">
          {items.map((item, i) => {
            const isRevealed = isInteractive ? i < revealedCount : false;
            const isNext = isInteractive && i === revealedCount;

            if (!isInteractive) {
              // Editor / thumbnail preview — show items with "hidden" overlay
              return (
                <div
                  key={i}
                  className="relative px-5 py-3 rounded-2xl border-2 border-teal-200 bg-white shadow-sm"
                >
                    <span className={`text-gray-800 ${getSlideBodyClasses(slide.body_size, 'list')} ${isAr ? 'font-cairo' : 'font-inter'}`}>
                      {item}
                    </span>
                  <div className="absolute inset-0 rounded-2xl bg-teal-900/80 backdrop-blur-sm flex items-center justify-center">
                    <span className="text-white text-xs font-bold flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                      Hidden
                    </span>
                  </div>
                </div>
              );
            }

            // Interactive (present) mode
            if (isRevealed) {
              return (
                <div
                  key={i}
                  className="px-5 py-3 rounded-2xl border-2 border-teal-400 bg-white shadow-lg shadow-teal-100/50 animate-in fade-in zoom-in duration-300"
                  style={{ animation: 'revealIn 0.4s ease-out' }}
                >
                  <span className={`text-gray-900 font-semibold ${getSlideBodyClasses(slide.body_size, 'list')} ${isAr ? 'font-cairo' : 'font-inter'}`}>
                    {item}
                  </span>
                </div>
              );
            }

            // Hidden in present mode
            return (
              <button
                key={i}
                onClick={isNext ? onReveal : undefined}
                className={`px-5 py-3 rounded-2xl border-2 border-dashed border-teal-300 bg-teal-50/50 shadow-sm flex items-center gap-2 transition-all ${
                  isNext ? 'cursor-pointer hover:border-teal-400 hover:bg-teal-50 hover:shadow-md' : 'cursor-default opacity-60'
                }`}
              >
                <svg className="w-5 h-5 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className={`text-teal-500 font-medium ${getSlideBodyClasses(slide.body_size, 'compact')}`}>
                  {isNext
                    ? (isAr ? 'اضغط للكشف' : 'Tap to reveal')
                    : (isAr ? '...' : '...')}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* CSS animation keyframes */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes revealIn {
          from { opacity: 0; transform: scale(0.8); }
          to { opacity: 1; transform: scale(1); }
        }
      `}} />
    </div>
  );
}
