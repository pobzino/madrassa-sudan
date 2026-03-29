import type { Slide } from '@/lib/slides.types';
import { OwlWelcome } from '@/components/illustrations';
import SlideImage, { SlideBackgroundImage } from './SlideImage';
import { getSlideBodyClasses, getSlideTitleClasses } from '../slideText';

interface Props {
  slide: Slide;
  language: 'ar' | 'en';
}

export default function TitleSlide({ slide, language }: Props) {
  const isAr = language === 'ar';
  const title = isAr ? slide.title_ar : slide.title_en;
  const body = isAr ? slide.body_ar : slide.body_en;
  const hasImage = !!slide.image_url;
  const isFullImage = slide.layout === 'full_image' && hasImage;

  if (isFullImage) {
    return (
      <div dir={isAr ? 'rtl' : 'ltr'} className="relative w-full h-full flex flex-col items-center justify-center p-8 sm:p-12 overflow-hidden">
        <SlideBackgroundImage src={slide.image_url!} />
        <h1 className={`relative z-10 text-white text-center font-fredoka font-bold leading-tight mb-3 sm:mb-4 drop-shadow-lg ${getSlideTitleClasses(slide.title_size, 'hero')} ${isAr ? 'font-cairo' : ''}`}>
          {title}
        </h1>
        {body && (
          <div className="relative z-10 bg-black/30 backdrop-blur-sm rounded-2xl px-6 py-3 max-w-[85%]">
            <p className={`text-white/90 text-center ${getSlideBodyClasses(slide.body_size)} ${isAr ? 'font-cairo' : 'font-inter'}`}>
              {body}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="relative w-full h-full bg-gradient-to-br from-[#007229] via-[#00913D] to-[#005C22] flex flex-col items-center justify-center p-8 sm:p-12 overflow-hidden"
    >
      {/* Decorative circles */}
      <div className="absolute top-[-60px] right-[-60px] w-[200px] h-[200px] rounded-full bg-white/10" />
      <div className="absolute bottom-[-80px] left-[-80px] w-[250px] h-[250px] rounded-full bg-white/5" />

      {/* Floating stars */}
      <svg className="absolute top-[12%] left-[8%] w-6 h-6 text-[#F59E0B]/60" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.4 5.6 21.2 8 14 2 9.2h7.6z" />
      </svg>
      <svg className="absolute top-[18%] right-[12%] w-4 h-4 text-white/40" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.4 5.6 21.2 8 14 2 9.2h7.6z" />
      </svg>
      <svg className="absolute bottom-[20%] right-[8%] w-5 h-5 text-[#F59E0B]/40" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.4 5.6 21.2 8 14 2 9.2h7.6z" />
      </svg>
      <div className="absolute bottom-[35%] left-[6%] w-3 h-3 rounded-full bg-[#F59E0B]/50" />
      <div className="absolute top-[40%] right-[5%] w-2 h-2 rounded-full bg-white/40" />

      {/* Wavy bottom decoration */}
      <svg className="absolute bottom-0 left-0 right-0 w-full" viewBox="0 0 400 30" preserveAspectRatio="none" fill="white" opacity="0.06">
        <path d="M0 20 Q50 0 100 20 Q150 40 200 20 Q250 0 300 20 Q350 40 400 20 V30 H0Z" />
      </svg>

      {/* Image or Owl mascot */}
      <div className="relative z-10 mb-3 sm:mb-5 w-20 h-20 sm:w-28 sm:h-28">
        {hasImage ? (
          <SlideImage src={slide.image_url!} className="w-full h-full shadow-lg" />
        ) : (
          <OwlWelcome />
        )}
      </div>

      {/* Title */}
      <h1 className={`relative z-10 text-white text-center font-fredoka font-bold leading-tight mb-3 sm:mb-4 ${getSlideTitleClasses(slide.title_size, 'hero')} ${isAr ? 'font-cairo' : ''}`}>
        {title}
      </h1>

      {/* Subtitle */}
      {body && (
        <div className="relative z-10 bg-white/15 backdrop-blur-sm rounded-2xl px-6 py-3 max-w-[85%]">
            <p className={`text-white/90 text-center ${getSlideBodyClasses(slide.body_size)} ${isAr ? 'font-cairo' : 'font-inter'}`}>
              {body}
            </p>
          </div>
      )}
    </div>
  );
}
