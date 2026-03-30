import type { Slide } from '@/lib/slides.types';
import { OwlThinking } from '@/components/illustrations';
import SlideImage, { SlideBackgroundImage } from './SlideImage';
import { getSlideBodyClasses, getSlideTitleClasses } from '../slideText';

interface Props {
  slide: Slide;
  language: 'ar' | 'en';
}

export default function DiagramSlide({ slide, language }: Props) {
  const isAr = language === 'ar';
  const title = isAr ? slide.title_ar : slide.title_en;
  const body = isAr ? slide.body_ar : slide.body_en;
  const hasImage = !!slide.image_url;
  const layout = slide.layout || 'default';

  if (layout === 'full_image' && hasImage) {
    return (
      <div dir={isAr ? 'rtl' : 'ltr'} className="relative w-full h-full flex flex-col justify-end p-8 sm:p-12 overflow-hidden">
        <SlideBackgroundImage src={slide.image_url!} />
        <h2 className={`relative z-10 font-fredoka font-bold text-white mb-2 drop-shadow-lg ${getSlideTitleClasses(slide.title_size)} ${isAr ? 'font-cairo' : ''}`}>
          {title}
        </h2>
        <div className="relative z-10 bg-black/30 backdrop-blur-sm rounded-2xl p-3 sm:p-4">
          <p className={`text-white/95 leading-relaxed whitespace-pre-line ${getSlideBodyClasses(slide.body_size, 'compact')} ${isAr ? 'font-cairo' : 'font-inter'}`}>
            {body}
          </p>
        </div>
      </div>
    );
  }

  const isReversed = layout === 'image_right';

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="relative w-full h-full bg-gradient-to-br from-cyan-50 via-white to-sky-50 flex flex-col overflow-hidden"
    >
      {/* Fun top bar */}
      <div className="h-2 bg-gradient-to-r from-cyan-400 via-[#007229] to-[#F59E0B] flex-shrink-0" />

      {/* Floating dots */}
      <div className="absolute top-[20%] left-[4%] w-3 h-3 rounded-full bg-cyan-300/40" />
      <div className="absolute top-[12%] right-[15%] w-2 h-2 rounded-full bg-[#F59E0B]/30" />
      <div className="absolute bottom-[15%] left-[10%] w-2 h-2 rounded-full bg-[#007229]/20" />

      {layout === 'image_top' && hasImage ? (
        <div className="flex-1 flex flex-col p-6 sm:p-10 md:p-12 gap-4">
          <div className="flex-shrink-0 h-2/5">
            <SlideImage src={slide.image_url!} className="w-full h-full shadow-md" />
          </div>
          <div className="flex-1 flex flex-col justify-center">
            <h2 className={`font-fredoka font-bold text-gray-900 mb-3 ${getSlideTitleClasses(slide.title_size)} ${isAr ? 'font-cairo' : ''}`}>
              {title}
            </h2>
            <div className="bg-white/80 rounded-2xl border border-cyan-100 p-4 shadow-sm">
              <p className={`text-gray-700 leading-relaxed whitespace-pre-line ${getSlideBodyClasses(slide.body_size, 'compact')} ${isAr ? 'font-cairo' : 'font-inter'}`}>
                {body}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className={`flex-1 flex ${isReversed ? 'flex-row-reverse' : 'flex-row'} p-6 sm:p-10 md:p-12 gap-4 sm:gap-6`}>
          {/* Text side */}
          <div className="flex-1 flex flex-col justify-center">
            <h2 className={`font-fredoka font-bold text-gray-900 mb-3 sm:mb-4 ${getSlideTitleClasses(slide.title_size)} ${isAr ? 'font-cairo' : ''}`}>
              {title}
            </h2>
            <div className="bg-white/80 rounded-2xl border border-cyan-100 p-4 shadow-sm">
              <p className={`text-gray-700 leading-relaxed whitespace-pre-line ${getSlideBodyClasses(slide.body_size, 'compact')} ${isAr ? 'font-cairo' : 'font-inter'}`}>
                {body}
              </p>
            </div>
            {/* Small owl */}
            <div className="mt-3 w-12 h-12 sm:w-14 sm:h-14 self-start">
              <OwlThinking />
            </div>
          </div>

          {/* Visual area — real image or placeholder */}
          <div className="flex-1 flex items-center justify-center">
            {hasImage ? (
              <SlideImage src={slide.image_url!} className="w-full h-full max-h-full shadow-md" />
            ) : (
              <div className="w-full h-full min-h-[120px] flex flex-col items-center justify-center p-4 sm:p-6">
                <div className="w-24 h-24 sm:w-32 sm:h-32 mb-3">
                  <OwlThinking />
                </div>
                {slide.visual_hint && (
                  <p className="text-xs sm:text-sm text-cyan-600 text-center font-medium max-w-[200px]">
                    {slide.visual_hint}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
