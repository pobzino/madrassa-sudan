import type { Slide } from '@/lib/slides.types';
import { OwlExcited } from '@/components/illustrations';
import SlideImage, { SlideBackgroundImage } from './SlideImage';
import { getSlideBodyClasses, getSlideTitleClasses } from '../slideText';
import {
  getSlideInteractionItems,
  getSlideInteractionOptions,
  getSlideInteractionTargets,
} from '@/lib/slide-interactions';

interface Props {
  slide: Slide;
  language: 'ar' | 'en';
}

function InteractionPreview({ slide, language }: Props) {
  const isAr = language === 'ar';
  const type = slide.interaction_type;
  if (!type) return null;

  const prompt = isAr
    ? slide.interaction_prompt_ar || slide.interaction_prompt_en
    : slide.interaction_prompt_en || slide.interaction_prompt_ar;
  const items = getSlideInteractionItems(slide, language);
  const targets = getSlideInteractionTargets(slide, language);

  return (
    <div className="relative z-10 w-full max-w-[85%] mt-3 border-2 border-dashed border-amber-300/60 rounded-2xl p-3 sm:p-4 bg-amber-50/50">
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-block px-2 py-0.5 bg-[#007229]/10 text-[#007229] rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider">
          {isAr ? 'تفاعلي' : 'Interactive'}
        </span>
        <span className="text-[10px] sm:text-xs text-gray-400">
          {type === 'choose_correct'
            ? isAr ? 'اختيار من متعدد' : 'Multiple Choice'
            : type === 'fill_missing_word'
              ? isAr ? 'أكمل الكلمة' : 'Fill Missing Word'
            : type === 'true_false'
              ? isAr ? 'صح أو خطأ' : 'True or False'
              : type === 'tap_to_count'
                ? isAr ? 'اضغط للعد' : 'Tap to Count'
                : type === 'match_pairs'
                  ? isAr ? 'طابق الأزواج' : 'Match Pairs'
                  : type === 'sequence_order'
                    ? isAr ? 'رتب التسلسل' : 'Sequence Order'
                    : isAr ? 'صنف في مجموعات' : 'Sort Into Groups'}
        </span>
      </div>

      {prompt && (
        <p className={`text-xs text-gray-500 mb-2 ${isAr ? 'font-cairo' : 'font-inter'}`}>
          {prompt}
        </p>
      )}

      {(type === 'choose_correct' || type === 'fill_missing_word') && (
        <div className="flex flex-wrap gap-1.5">
          {getSlideInteractionOptions(slide, language).map((option, i) => (
            <span
              key={i}
              className={`inline-block px-3 py-1.5 rounded-xl text-xs border ${
                i === slide.interaction_correct_index
                  ? 'border-[#007229]/30 bg-[#007229]/5 text-[#007229]/70'
                  : 'border-gray-200 bg-white text-gray-400'
              } ${isAr ? 'font-cairo' : 'font-inter'}`}
            >
              {option}
            </span>
          ))}
        </div>
      )}

      {type === 'match_pairs' && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            {items.map((item, index) => (
              <div key={`item-${index}`} className={`rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs ${isAr ? 'font-cairo' : 'font-inter'}`}>
                {item}
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            {targets.map((target, index) => (
              <div key={`target-${index}`} className={`rounded-xl border border-dashed border-[#007229]/30 bg-[#007229]/5 px-3 py-1.5 text-xs text-[#007229] ${isAr ? 'font-cairo' : 'font-inter'}`}>
                {target}
              </div>
            ))}
          </div>
        </div>
      )}

      {type === 'sequence_order' && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, index) => (
            <span
              key={index}
              className={`inline-block rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs ${isAr ? 'font-cairo' : 'font-inter'}`}
            >
              {index + 1}. {item}
            </span>
          ))}
        </div>
      )}

      {type === 'sort_groups' && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {targets.map((target, index) => (
              <span
                key={index}
                className={`inline-block rounded-xl border border-[#007229]/20 bg-[#007229]/5 px-3 py-1 text-[10px] font-semibold text-[#007229] ${isAr ? 'font-cairo' : 'font-inter'}`}
              >
                {target}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {items.map((item, index) => (
              <span
                key={index}
                className={`inline-block rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs ${isAr ? 'font-cairo' : 'font-inter'}`}
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      )}

      {type === 'true_false' && (
        <div className="flex gap-2">
          <span className={`inline-block px-4 py-1.5 rounded-xl text-xs font-semibold border ${
            slide.interaction_true_false_answer === true
              ? 'border-[#007229]/30 bg-[#007229]/5 text-[#007229]/70'
              : 'border-gray-200 bg-white text-gray-400'
          }`}>
            {isAr ? 'صح' : 'True'}
          </span>
          <span className={`inline-block px-4 py-1.5 rounded-xl text-xs font-semibold border ${
            slide.interaction_true_false_answer === false
              ? 'border-[#D21034]/30 bg-[#D21034]/5 text-[#D21034]/70'
              : 'border-gray-200 bg-white text-gray-400'
          }`}>
            {isAr ? 'خطأ' : 'False'}
          </span>
        </div>
      )}

      {type === 'tap_to_count' && (
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {Array.from({ length: Math.min(slide.interaction_count_target ?? 5, 8) }).map((_, i) => (
              <span key={i} className="text-lg opacity-50">
                {slide.interaction_visual_emoji?.trim() || '🍎'}
              </span>
            ))}
          </div>
          <span className="text-[10px] text-gray-400">
            = {slide.interaction_count_target ?? 5}
          </span>
        </div>
      )}
    </div>
  );
}

export default function ActivitySlide({ slide, language }: Props) {
  const isAr = language === 'ar';
  const title = isAr ? slide.title_ar : slide.title_en;
  const body = isAr ? slide.body_ar : slide.body_en;
  const hasImage = !!slide.image_url;

  if (slide.layout === 'full_image' && hasImage) {
    return (
      <div dir={isAr ? 'rtl' : 'ltr'} className="relative w-full h-full flex flex-col items-center p-8 sm:p-12 overflow-y-auto" style={{ justifyContent: 'safe center' }}>
        <SlideBackgroundImage src={slide.image_url!} />
        <span className="relative z-10 inline-block px-5 py-2 bg-gradient-to-r from-amber-400 to-[#F59E0B] text-white rounded-full text-xs sm:text-sm font-bold mb-3 shadow-md">
          {isAr ? '🎯 نشاط' : '🎯 Activity'}
        </span>
        <h2 className={`relative z-10 font-fredoka font-bold text-white text-center mb-4 drop-shadow-lg ${getSlideTitleClasses(slide.title_size)} ${isAr ? 'font-cairo' : ''}`}>
          {title}
        </h2>
        <div className="relative z-10 w-full max-w-[85%] bg-black/30 backdrop-blur-sm rounded-3xl p-4 sm:p-6 md:p-8">
          <p className={`text-white text-center leading-relaxed whitespace-pre-line ${getSlideBodyClasses(slide.body_size)} ${isAr ? 'font-cairo' : 'font-inter'}`}>
            {body}
          </p>
        </div>
        <InteractionPreview slide={slide} language={language} />
      </div>
    );
  }

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="relative w-full h-full bg-gradient-to-br from-[#FFF7ED] via-[#FFFBEB] to-amber-100 flex flex-col items-center p-8 sm:p-12 overflow-y-auto"
      style={{ justifyContent: 'safe center' }}
    >
      {/* Fun decorative elements */}
      <div className="absolute top-[-30px] right-[-30px] w-[120px] h-[120px] rounded-full bg-[#F59E0B]/10" />
      <div className="absolute bottom-[-40px] left-[-40px] w-[140px] h-[140px] rounded-full bg-amber-200/30" />

      {/* Floating stars and sparkles */}
      <svg className="absolute top-[10%] left-[8%] w-6 h-6 text-[#F59E0B]/50" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.4 5.6 21.2 8 14 2 9.2h7.6z" />
      </svg>
      <svg className="absolute bottom-[20%] right-[6%] w-4 h-4 text-amber-400/40" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.4 5.6 21.2 8 14 2 9.2h7.6z" />
      </svg>
      <div className="absolute top-[30%] right-[4%] w-2 h-2 rounded-full bg-[#D21034]/20" />
      <div className="absolute bottom-[40%] left-[5%] w-3 h-3 rounded-full bg-[#007229]/15" />

      {/* Image or Owl mascot */}
      <div className="relative z-10 w-16 h-16 sm:w-20 sm:h-20 mb-2 sm:mb-3">
        {hasImage ? (
          <SlideImage src={slide.image_url!} className="w-full h-full shadow-md" />
        ) : (
          <OwlExcited />
        )}
      </div>

      {/* Badge */}
      <span className="relative z-10 inline-block px-5 py-2 bg-gradient-to-r from-amber-400 to-[#F59E0B] text-white rounded-full text-xs sm:text-sm font-bold mb-3 sm:mb-5 shadow-md">
        {isAr ? '🎯 نشاط' : '🎯 Activity'}
      </span>

      {/* Title */}
      <h2 className={`relative z-10 font-fredoka font-bold text-gray-900 text-center mb-4 sm:mb-5 ${getSlideTitleClasses(slide.title_size)} ${isAr ? 'font-cairo' : ''}`}>
        {title}
      </h2>

      {/* Activity card */}
      <div className="relative z-10 w-full max-w-[85%] bg-white border-2 border-amber-300 rounded-3xl p-4 sm:p-6 md:p-8 shadow-lg shadow-amber-100">
        <p className={`text-gray-800 text-center leading-relaxed whitespace-pre-line ${getSlideBodyClasses(slide.body_size)} ${isAr ? 'font-cairo' : 'font-inter'}`}>
          {body}
        </p>
      </div>

      <InteractionPreview slide={slide} language={language} />
    </div>
  );
}
