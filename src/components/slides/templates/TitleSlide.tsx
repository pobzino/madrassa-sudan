import type { Slide } from '@/lib/slides.types';
import { OwlWelcome } from '@/components/illustrations';
import SlideImage, { SlideBackgroundImage } from './SlideImage';
import { getSlideBodyClasses, getSlideTitleClasses } from '../slideText';
import { getSlideLanguageBlock } from './bilingual';

interface Props {
  slide: Slide;
  language: 'ar' | 'en';
}

function LanguageBody({ slide, language }: Props) {
  const block = getSlideLanguageBlock(slide, language);

  if (!block.body) {
    return null;
  }

  return (
    <div dir={block.dir} className="max-w-[88%] rounded-2xl bg-white/15 px-6 py-4 backdrop-blur-sm">
      <p
        className={`text-white/90 ${getSlideBodyClasses(slide.body_size)} ${
          block.isArabic ? 'font-cairo' : 'font-inter'
        }`}
      >
        {block.body}
      </p>
    </div>
  );
}

export default function TitleSlide({ slide, language }: Props) {
  const primary = getSlideLanguageBlock(slide, language);
  const hasImage = !!slide.image_url;
  const isFullImage = slide.layout === 'full_image' && hasImage;

  if (isFullImage) {
    return (
      <div className="relative w-full h-full flex flex-col items-center p-8 sm:p-12 overflow-y-auto" style={{ justifyContent: 'safe center' }}>
        <SlideBackgroundImage src={slide.image_url!} />
        <h1
          dir={primary.dir}
          className={`relative z-10 mb-2 text-center font-fredoka font-bold leading-tight text-white drop-shadow-lg ${getSlideTitleClasses(slide.title_size, 'hero')} ${
            primary.isArabic ? 'font-cairo' : ''
          }`}
        >
          {primary.title}
        </h1>
        <div className="relative z-10 rounded-2xl bg-black/30 backdrop-blur-sm">
          <LanguageBody slide={slide} language={language} />
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-gradient-to-br from-[#007229] via-[#00913D] to-[#005C22] flex flex-col items-center p-8 sm:p-12 overflow-y-auto" style={{ justifyContent: 'safe center' }}>
      <div className="absolute top-[-60px] right-[-60px] w-[200px] h-[200px] rounded-full bg-white/10" />
      <div className="absolute bottom-[-80px] left-[-80px] w-[250px] h-[250px] rounded-full bg-white/5" />
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
      <svg className="absolute bottom-0 left-0 right-0 w-full" viewBox="0 0 400 30" preserveAspectRatio="none" fill="white" opacity="0.06">
        <path d="M0 20 Q50 0 100 20 Q150 40 200 20 Q250 0 300 20 Q350 40 400 20 V30 H0Z" />
      </svg>

      <div className="relative z-10 mb-3 sm:mb-5 w-20 h-20 sm:w-28 sm:h-28">
        {hasImage ? (
          <SlideImage src={slide.image_url!} className="w-full h-full shadow-lg" />
        ) : (
          <OwlWelcome />
        )}
      </div>

      <h1
        dir={primary.dir}
        className={`relative z-10 mb-2 text-center font-fredoka font-bold leading-tight text-white ${getSlideTitleClasses(slide.title_size, 'hero')} ${
          primary.isArabic ? 'font-cairo' : ''
        }`}
      >
        {primary.title}
      </h1>

      <div className="relative z-10">
        <LanguageBody slide={slide} language={language} />
      </div>
    </div>
  );
}
