import type { Slide } from '@/lib/slides.types';
import { OwlCelebrating } from '@/components/illustrations';
import SlideImage from './SlideImage';
import { getSlideBodyClasses, getSlideTitleClasses } from '../slideText';
import { getSlideLanguageBlock } from './bilingual';

interface Props {
  slide: Slide;
  language: 'ar' | 'en';
}

export default function SummarySlide({ slide, language }: Props) {
  const primary = getSlideLanguageBlock(slide, language);
  const hasImage = !!slide.image_url;

  return (
    <div className="relative w-full h-full bg-gradient-to-br from-[#007229] via-[#00913D] to-[#004D1A] flex flex-col items-center p-8 sm:p-12 overflow-y-auto" style={{ justifyContent: 'safe center' }}>
      <div className="absolute top-[-40px] left-[-40px] w-[160px] h-[160px] rounded-full bg-white/8" />
      <div className="absolute bottom-[-60px] right-[-60px] w-[200px] h-[200px] rounded-full bg-white/5" />
      <svg className="absolute top-[8%] right-[10%] w-6 h-6 text-[#F59E0B]/60" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.4 5.6 21.2 8 14 2 9.2h7.6z" />
      </svg>
      <svg className="absolute top-[15%] left-[7%] w-4 h-4 text-white/30" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.4 5.6 21.2 8 14 2 9.2h7.6z" />
      </svg>
      <svg className="absolute bottom-[12%] left-[10%] w-5 h-5 text-[#F59E0B]/40" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.4 5.6 21.2 8 14 2 9.2h7.6z" />
      </svg>
      <div className="absolute bottom-[30%] right-[5%] w-3 h-3 rounded-full bg-[#F59E0B]/40" />
      <svg className="absolute bottom-0 left-0 right-0 w-full" viewBox="0 0 400 25" preserveAspectRatio="none" fill="white" opacity="0.06">
        <path d="M0 15 Q50 0 100 15 Q150 30 200 15 Q250 0 300 15 Q350 30 400 15 V25 H0Z" />
      </svg>

      <div className="relative z-10 w-16 h-16 sm:w-20 sm:h-20 mb-2 sm:mb-3">
        {hasImage ? (
          <SlideImage src={slide.image_url!} className="w-full h-full shadow-lg" />
        ) : (
          <OwlCelebrating />
        )}
      </div>

      <span className="relative z-10 inline-block px-5 py-2 bg-[#F59E0B] text-white rounded-full text-xs sm:text-sm font-bold mb-3 sm:mb-5 shadow-md">
        {language === 'en' ? 'Summary' : 'ملخص'}
      </span>

      <h2
        dir={primary.dir}
        className={`relative z-10 mb-1 text-center font-fredoka font-bold text-white ${getSlideTitleClasses(
          slide.title_size,
          'hero'
        )} ${primary.isArabic ? 'font-cairo' : ''}`}
      >
        {primary.title}
      </h2>

      <div className="relative z-10 w-full max-w-[90%]">
        {(() => {
          const lines =
            primary.bullets.length > 0 ? primary.bullets : primary.body.split('\n').filter(Boolean);

          return (
            <div className="space-y-2">
              {lines.map((line, index) => (
                <div key={`${primary.language}-${index}`} className="flex items-start gap-3 bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-2.5">
                  <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#F59E0B] text-white flex items-center justify-center shadow-sm">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p
                    dir={primary.dir}
                    className={`flex-1 pt-0.5 text-white/95 ${getSlideBodyClasses(slide.body_size, 'list')} ${
                      primary.isArabic ? 'font-cairo' : 'font-inter'
                    }`}
                  >
                    {line}
                  </p>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
