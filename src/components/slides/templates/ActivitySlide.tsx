import type { Slide, SlideInteractionType } from '@/lib/slides.types';
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

/* ─── Theme config per interaction type ─── */

interface InteractionTheme {
  emoji: string;
  label_ar: string;
  label_en: string;
  gradient: string;
  badgeGradient: string;
  cardBorder: string;
  cardShadow: string;
  previewBorder: string;
  previewBg: string;
  accentColor: string;
  accentBg: string;
  decorCircle1: string;
  decorCircle2: string;
  decorStar: string;
}

const INTERACTION_THEMES: Record<string, InteractionTheme> = {
  choose_correct: {
    emoji: '🅰️',
    label_ar: 'اختيار من متعدد',
    label_en: 'Choose the Answer',
    gradient: 'from-emerald-50 via-white to-green-50',
    badgeGradient: 'from-emerald-500 to-[#007229]',
    cardBorder: 'border-emerald-300',
    cardShadow: 'shadow-emerald-100',
    previewBorder: 'border-emerald-300/60',
    previewBg: 'bg-emerald-50/50',
    accentColor: 'text-emerald-600',
    accentBg: 'bg-emerald-500',
    decorCircle1: 'bg-emerald-200/30',
    decorCircle2: 'bg-[#007229]/10',
    decorStar: 'text-emerald-400/50',
  },
  true_false: {
    emoji: '⚖️',
    label_ar: 'صح أو خطأ',
    label_en: 'True or False',
    gradient: 'from-blue-50 via-white to-indigo-50',
    badgeGradient: 'from-blue-500 to-indigo-600',
    cardBorder: 'border-blue-300',
    cardShadow: 'shadow-blue-100',
    previewBorder: 'border-blue-300/60',
    previewBg: 'bg-blue-50/50',
    accentColor: 'text-blue-600',
    accentBg: 'bg-blue-500',
    decorCircle1: 'bg-blue-200/30',
    decorCircle2: 'bg-indigo-300/20',
    decorStar: 'text-blue-400/50',
  },
  fill_missing_word: {
    emoji: '✏️',
    label_ar: 'أكمل الكلمة',
    label_en: 'Fill the Blank',
    gradient: 'from-violet-50 via-white to-purple-50',
    badgeGradient: 'from-violet-500 to-purple-600',
    cardBorder: 'border-violet-300',
    cardShadow: 'shadow-violet-100',
    previewBorder: 'border-violet-300/60',
    previewBg: 'bg-violet-50/50',
    accentColor: 'text-violet-600',
    accentBg: 'bg-violet-500',
    decorCircle1: 'bg-violet-200/30',
    decorCircle2: 'bg-purple-300/20',
    decorStar: 'text-violet-400/50',
  },
  tap_to_count: {
    emoji: '🔢',
    label_ar: 'اضغط للعد',
    label_en: 'Count Them',
    gradient: 'from-amber-50 via-[#FFFBEB] to-yellow-50',
    badgeGradient: 'from-amber-400 to-[#F59E0B]',
    cardBorder: 'border-amber-300',
    cardShadow: 'shadow-amber-100',
    previewBorder: 'border-amber-300/60',
    previewBg: 'bg-amber-50/50',
    accentColor: 'text-amber-600',
    accentBg: 'bg-amber-500',
    decorCircle1: 'bg-amber-200/30',
    decorCircle2: 'bg-yellow-300/20',
    decorStar: 'text-amber-400/50',
  },
  match_pairs: {
    emoji: '🔗',
    label_ar: 'طابق الأزواج',
    label_en: 'Match Pairs',
    gradient: 'from-teal-50 via-white to-cyan-50',
    badgeGradient: 'from-teal-500 to-cyan-600',
    cardBorder: 'border-teal-300',
    cardShadow: 'shadow-teal-100',
    previewBorder: 'border-teal-300/60',
    previewBg: 'bg-teal-50/50',
    accentColor: 'text-teal-600',
    accentBg: 'bg-teal-500',
    decorCircle1: 'bg-teal-200/30',
    decorCircle2: 'bg-cyan-300/20',
    decorStar: 'text-teal-400/50',
  },
  sequence_order: {
    emoji: '🔢',
    label_ar: 'رتّب التسلسل',
    label_en: 'Put in Order',
    gradient: 'from-orange-50 via-white to-red-50',
    badgeGradient: 'from-orange-400 to-red-500',
    cardBorder: 'border-orange-300',
    cardShadow: 'shadow-orange-100',
    previewBorder: 'border-orange-300/60',
    previewBg: 'bg-orange-50/50',
    accentColor: 'text-orange-600',
    accentBg: 'bg-orange-500',
    decorCircle1: 'bg-orange-200/30',
    decorCircle2: 'bg-red-300/20',
    decorStar: 'text-orange-400/50',
  },
  sort_groups: {
    emoji: '📦',
    label_ar: 'صنّف في مجموعات',
    label_en: 'Sort Into Groups',
    gradient: 'from-pink-50 via-white to-rose-50',
    badgeGradient: 'from-pink-400 to-rose-500',
    cardBorder: 'border-pink-300',
    cardShadow: 'shadow-pink-100',
    previewBorder: 'border-pink-300/60',
    previewBg: 'bg-pink-50/50',
    accentColor: 'text-pink-600',
    accentBg: 'bg-pink-500',
    decorCircle1: 'bg-pink-200/30',
    decorCircle2: 'bg-rose-300/20',
    decorStar: 'text-pink-400/50',
  },
};

const DEFAULT_THEME: InteractionTheme = {
  emoji: '🎯',
  label_ar: 'نشاط',
  label_en: 'Activity',
  gradient: 'from-[#FFF7ED] via-[#FFFBEB] to-amber-100',
  badgeGradient: 'from-amber-400 to-[#F59E0B]',
  cardBorder: 'border-amber-300',
  cardShadow: 'shadow-amber-100',
  previewBorder: 'border-amber-300/60',
  previewBg: 'bg-amber-50/50',
  accentColor: 'text-amber-600',
  accentBg: 'bg-amber-500',
  decorCircle1: 'bg-amber-200/30',
  decorCircle2: 'bg-[#F59E0B]/10',
  decorStar: 'text-[#F59E0B]/50',
};

function getTheme(type: SlideInteractionType | null | undefined): InteractionTheme {
  if (!type) return DEFAULT_THEME;
  return INTERACTION_THEMES[type] || DEFAULT_THEME;
}

/* ─── Interaction Preview ─── */

function InteractionPreview({ slide, language }: Props) {
  const isAr = language === 'ar';
  const type = slide.interaction_type;
  if (!type) return null;

  const theme = getTheme(type);
  const prompt = isAr
    ? slide.interaction_prompt_ar || slide.interaction_prompt_en
    : slide.interaction_prompt_en || slide.interaction_prompt_ar;
  const items = getSlideInteractionItems(slide, language);
  const targets = getSlideInteractionTargets(slide, language);

  return (
    <div className={`relative z-10 w-full max-w-[85%] mt-3 border-2 border-dashed ${theme.previewBorder} rounded-2xl p-3 sm:p-4 ${theme.previewBg}`}>
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
              {type === 'choose_correct' && (
                <span className="font-bold mr-1 opacity-50">
                  {String.fromCharCode(65 + i)}
                </span>
              )}
              {option}
            </span>
          ))}
        </div>
      )}

      {type === 'match_pairs' && (
        <div className="grid grid-cols-[1fr_auto_1fr] gap-x-2 gap-y-1.5 items-center">
          {items.map((item, index) => (
            <div key={`pair-${index}`} className="contents">
              <div className={`rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs ${isAr ? 'font-cairo' : 'font-inter'}`}>
                {item}
              </div>
              <svg className="w-4 h-4 text-teal-300 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              <div className={`rounded-xl border border-dashed border-teal-300/60 bg-teal-50/50 px-3 py-1.5 text-xs text-teal-700 ${isAr ? 'font-cairo' : 'font-inter'}`}>
                {targets[index] ?? '?'}
              </div>
            </div>
          ))}
        </div>
      )}

      {type === 'sequence_order' && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, index) => (
            <span
              key={index}
              className={`inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs ${isAr ? 'font-cairo' : 'font-inter'}`}
            >
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-orange-100 text-orange-600 text-[10px] font-bold flex-shrink-0">
                {index + 1}
              </span>
              {item}
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
                className={`inline-block rounded-xl border border-pink-300/40 bg-pink-100/50 px-3 py-1 text-[10px] font-semibold text-pink-700 ${isAr ? 'font-cairo' : 'font-inter'}`}
              >
                📦 {target}
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
        <div className="flex gap-3 justify-center">
          <span className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-semibold border-2 ${
            slide.interaction_true_false_answer === true
              ? 'border-[#007229]/40 bg-[#007229]/10 text-[#007229]'
              : 'border-gray-200 bg-white text-gray-400'
          }`}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {isAr ? 'صح' : 'True'}
          </span>
          <span className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-semibold border-2 ${
            slide.interaction_true_false_answer === false
              ? 'border-[#D21034]/40 bg-[#D21034]/10 text-[#D21034]'
              : 'border-gray-200 bg-white text-gray-400'
          }`}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            {isAr ? 'خطأ' : 'False'}
          </span>
        </div>
      )}

      {type === 'tap_to_count' && (
        <div className="flex flex-col items-center gap-2">
          <div className="flex flex-wrap justify-center gap-1.5">
            {Array.from({ length: Math.min(slide.interaction_count_target ?? 5, 8) }).map((_, i) => (
              <span key={i} className="text-2xl sm:text-3xl drop-shadow-sm">
                {slide.interaction_visual_emoji?.trim() || '🍎'}
              </span>
            ))}
          </div>
          <span className="text-xs font-bold text-amber-600 bg-amber-100 px-3 py-1 rounded-full">
            ? = {slide.interaction_count_target ?? 5}
          </span>
        </div>
      )}
    </div>
  );
}

/* ─── Main ActivitySlide ─── */

export default function ActivitySlide({ slide, language }: Props) {
  const isAr = language === 'ar';
  const title = isAr ? slide.title_ar : slide.title_en;
  const body = isAr ? slide.body_ar : slide.body_en;
  const hasImage = !!slide.image_url;
  const theme = getTheme(slide.interaction_type);

  if (slide.layout === 'full_image' && hasImage) {
    return (
      <div dir={isAr ? 'rtl' : 'ltr'} className="relative w-full h-full flex flex-col items-center p-8 sm:p-12 overflow-y-auto" style={{ justifyContent: 'safe center' }}>
        <SlideBackgroundImage src={slide.image_url!} />
        <span className={`relative z-10 inline-block px-5 py-2 bg-gradient-to-r ${theme.badgeGradient} text-white rounded-full text-xs sm:text-sm font-bold mb-3 shadow-md`}>
          {theme.emoji} {isAr ? theme.label_ar : theme.label_en}
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
      className={`relative w-full h-full bg-gradient-to-br ${theme.gradient} flex flex-col items-center p-8 sm:p-12 overflow-y-auto`}
      style={{ justifyContent: 'safe center' }}
    >
      {/* Decorative elements */}
      <div className={`absolute top-[-30px] right-[-30px] w-[120px] h-[120px] rounded-full ${theme.decorCircle2}`} />
      <div className={`absolute bottom-[-40px] left-[-40px] w-[140px] h-[140px] rounded-full ${theme.decorCircle1}`} />
      <svg className={`absolute top-[10%] left-[8%] w-6 h-6 ${theme.decorStar}`} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.4 5.6 21.2 8 14 2 9.2h7.6z" />
      </svg>
      <svg className={`absolute bottom-[20%] right-[6%] w-4 h-4 ${theme.decorStar} opacity-60`} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.4 5.6 21.2 8 14 2 9.2h7.6z" />
      </svg>

      {/* Image or Owl mascot */}
      <div className="relative z-10 w-16 h-16 sm:w-20 sm:h-20 mb-2 sm:mb-3">
        {hasImage ? (
          <SlideImage src={slide.image_url!} className="w-full h-full shadow-md" />
        ) : (
          <OwlExcited />
        )}
      </div>

      {/* Badge — colored per interaction type */}
      <span className={`relative z-10 inline-block px-5 py-2 bg-gradient-to-r ${theme.badgeGradient} text-white rounded-full text-xs sm:text-sm font-bold mb-3 sm:mb-5 shadow-md`}>
        {theme.emoji} {isAr ? theme.label_ar : theme.label_en}
      </span>

      {/* Title */}
      <h2 className={`relative z-10 font-fredoka font-bold text-gray-900 text-center mb-4 sm:mb-5 ${getSlideTitleClasses(slide.title_size)} ${isAr ? 'font-cairo' : ''}`}>
        {title}
      </h2>

      {/* Activity card — border colored per type */}
      <div className={`relative z-10 w-full max-w-[85%] bg-white border-2 ${theme.cardBorder} rounded-3xl p-4 sm:p-6 md:p-8 shadow-lg ${theme.cardShadow}`}>
        <p className={`text-gray-800 text-center leading-relaxed whitespace-pre-line ${getSlideBodyClasses(slide.body_size)} ${isAr ? 'font-cairo' : 'font-inter'}`}>
          {body}
        </p>
      </div>

      <InteractionPreview slide={slide} language={language} />
    </div>
  );
}
