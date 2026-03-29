import type { Slide } from '@/lib/slides.types';
import { OwlConfused } from '@/components/illustrations';
import SlideImage from './SlideImage';
import { getSlideBodyClasses, getSlideTitleClasses } from '../slideText';

interface Props {
  slide: Slide;
  language: 'ar' | 'en';
}

export default function QuizPreviewSlide({ slide, language }: Props) {
  const isAr = language === 'ar';
  const title = isAr ? slide.title_ar : slide.title_en;
  const body = isAr ? slide.body_ar : slide.body_en;
  const hasImage = !!slide.image_url;

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="relative w-full h-full bg-gradient-to-br from-red-50 via-white to-pink-50 flex flex-col items-center justify-center p-8 sm:p-12 overflow-hidden"
    >
      {/* Red accent top */}
      <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-[#D21034] via-pink-400 to-[#E8334F]" />

      {/* Decorative circles */}
      <div className="absolute top-[-30px] left-[-30px] w-[120px] h-[120px] rounded-full bg-[#D21034]/5" />
      <div className="absolute bottom-[-40px] right-[-40px] w-[160px] h-[160px] rounded-full bg-pink-200/30" />

      {/* Floating question marks */}
      <span className="absolute top-[15%] left-[8%] text-2xl text-[#D21034]/15 font-fredoka font-bold">?</span>
      <span className="absolute top-[20%] right-[10%] text-lg text-pink-300/30 font-fredoka font-bold">?</span>
      <span className="absolute bottom-[25%] left-[12%] text-xl text-[#D21034]/10 font-fredoka font-bold">?</span>
      <div className="absolute bottom-[15%] right-[5%] w-3 h-3 rounded-full bg-[#F59E0B]/20" />

      {/* Image or Owl mascot */}
      <div className="relative z-10 w-14 h-14 sm:w-18 sm:h-18 mb-2 sm:mb-3">
        {hasImage ? (
          <SlideImage src={slide.image_url!} className="w-full h-full shadow-md" />
        ) : (
          <OwlConfused />
        )}
      </div>

      {/* Badge */}
      <span className="relative z-10 inline-block px-5 py-2 bg-gradient-to-r from-[#D21034] to-[#E8334F] text-white rounded-full text-xs sm:text-sm font-bold mb-3 sm:mb-5 shadow-md">
        {isAr ? '❓ سؤال' : '❓ Quiz Question'}
      </span>

      {/* Title */}
      <h2 className={`relative z-10 font-fredoka font-bold text-gray-900 text-center mb-4 sm:mb-5 ${getSlideTitleClasses(slide.title_size)} ${isAr ? 'font-cairo' : ''}`}>
        {title}
      </h2>

      {/* Question card */}
      <div className="relative z-10 w-full max-w-[85%] border-2 border-[#D21034]/30 rounded-3xl p-4 sm:p-6 md:p-8 bg-white shadow-lg shadow-red-100/50">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-[#D21034] to-[#E8334F] text-white flex items-center justify-center shadow-md">
            <span className="text-xl sm:text-2xl font-bold font-fredoka">?</span>
          </div>
          <p className={`flex-1 text-gray-800 leading-relaxed whitespace-pre-line ${getSlideBodyClasses(slide.body_size)} ${isAr ? 'font-cairo' : 'font-inter'}`}>
            {body}
          </p>
        </div>
      </div>
    </div>
  );
}
