import type { Slide } from '@/lib/slides.types';
import { OwlReading } from '@/components/illustrations';
import SlideImage, { SlideBackgroundImage } from './SlideImage';
import { getSlideBodyClasses, getSlideTitleClasses } from '../slideText';

interface Props {
  slide: Slide;
  language: 'ar' | 'en';
}

export default function ContentSlide({ slide, language }: Props) {
  const isAr = language === 'ar';
  const title = isAr ? slide.title_ar : slide.title_en;
  const body = isAr ? slide.body_ar : slide.body_en;
  const hasImage = !!slide.image_url;
  const layout = slide.layout || 'default';

  if (layout === 'full_image' && hasImage) {
    return (
      <div dir={isAr ? 'rtl' : 'ltr'} className="relative w-full h-full flex flex-col justify-end p-8 sm:p-12 overflow-hidden">
        <SlideBackgroundImage src={slide.image_url!} />
        <h2 className={`relative z-10 font-fredoka font-bold text-white mb-3 drop-shadow-lg ${getSlideTitleClasses(slide.title_size)} ${isAr ? 'font-cairo' : ''}`}>
          {title}
        </h2>
        <div className="relative z-10 bg-black/30 backdrop-blur-sm rounded-2xl p-4 sm:p-6">
          <p className={`text-white/95 leading-relaxed whitespace-pre-line ${getSlideBodyClasses(slide.body_size)} ${isAr ? 'font-cairo' : 'font-inter'}`}>
            {body}
          </p>
        </div>
      </div>
    );
  }

  const isHorizontal = layout === 'image_left' || layout === 'image_right';
  const isImageTop = layout === 'image_top';

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="relative w-full h-full bg-gradient-to-br from-emerald-50 via-white to-green-50 flex flex-col overflow-hidden"
    >
      {/* Colorful top bar */}
      <div className="h-2 bg-gradient-to-r from-[#007229] via-[#F59E0B] to-[#D21034] flex-shrink-0" />

      {/* Floating decorations */}
      <div className="absolute top-[15%] right-[5%] w-3 h-3 rounded-full bg-[#F59E0B]/30" />
      <div className="absolute top-[25%] right-[10%] w-2 h-2 rounded-full bg-[#007229]/20" />
      <svg className="absolute bottom-[15%] left-[5%] w-5 h-5 text-[#007229]/15" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.4 5.6 21.2 8 14 2 9.2h7.6z" />
      </svg>
      <div className="absolute bottom-[-40px] right-[-40px] w-[160px] h-[160px] rounded-full bg-[#007229]/5" />

      <div className={`flex-1 flex ${isHorizontal ? (layout === 'image_left' ? 'flex-row' : 'flex-row-reverse') : 'flex-col'} gap-4 p-6 sm:p-10 md:p-14`}>
        {/* Image area for horizontal/top layouts */}
        {hasImage && (isHorizontal || isImageTop) && (
          <div className={isHorizontal ? 'w-2/5 flex-shrink-0 flex items-center' : 'flex-shrink-0 h-1/3'}>
            <SlideImage src={slide.image_url!} className={`w-full ${isHorizontal ? 'h-full max-h-full' : 'h-full'} shadow-md`} />
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 flex flex-col justify-center min-w-0">
          <h2 className={`font-fredoka font-bold text-gray-900 mb-4 sm:mb-6 ${getSlideTitleClasses(slide.title_size)} ${isAr ? 'font-cairo' : ''}`}>
            {title}
          </h2>
          <div className="bg-white/80 rounded-2xl border border-emerald-100 p-4 sm:p-6 shadow-sm">
            <p className={`text-gray-700 leading-relaxed whitespace-pre-line ${getSlideBodyClasses(slide.body_size)} ${isAr ? 'font-cairo' : 'font-inter'}`}>
              {body}
            </p>
          </div>
        </div>

        {/* Owl mascot (hidden if image shown in default mode, or in layout modes) */}
        {!hasImage && !isHorizontal && !isImageTop && (
          <div className="hidden sm:flex items-end flex-shrink-0 w-20 md:w-24 pb-4">
            <OwlReading />
          </div>
        )}

        {/* Image replaces owl in default mode */}
        {hasImage && !isHorizontal && !isImageTop && (
          <div className="hidden sm:flex items-center flex-shrink-0 w-28 md:w-36">
            <SlideImage src={slide.image_url!} className="w-full h-auto max-h-full shadow-md" objectFit="contain" />
          </div>
        )}
      </div>
    </div>
  );
}
