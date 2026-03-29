import type { Slide } from '@/lib/slides.types';
import { OwlPointing } from '@/components/illustrations';
import SlideImage from './SlideImage';
import { getSlideBodyClasses, getSlideTitleClasses } from '../slideText';

interface Props {
  slide: Slide;
  language: 'ar' | 'en';
}

const BULLET_COLORS = [
  { bg: 'bg-[#007229]', card: 'bg-emerald-50 border-emerald-200' },
  { bg: 'bg-[#D21034]', card: 'bg-red-50 border-red-200' },
  { bg: 'bg-[#F59E0B]', card: 'bg-amber-50 border-amber-200' },
  { bg: 'bg-violet-500', card: 'bg-violet-50 border-violet-200' },
  { bg: 'bg-cyan-500', card: 'bg-cyan-50 border-cyan-200' },
  { bg: 'bg-pink-500', card: 'bg-pink-50 border-pink-200' },
];

export default function KeyPointsSlide({ slide, language }: Props) {
  const isAr = language === 'ar';
  const title = isAr ? slide.title_ar : slide.title_en;
  const bullets = (isAr ? slide.bullets_ar : slide.bullets_en) || [];
  const hasImage = !!slide.image_url;
  const layout = slide.layout || 'default';
  const isHorizontal = layout === 'image_left' || layout === 'image_right';

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="relative w-full h-full bg-gradient-to-br from-green-50 via-white to-emerald-50 flex overflow-hidden"
    >
      {/* Colorful left/right edge */}
      <div className={`w-2 flex-shrink-0 ${isAr ? 'order-last' : ''}`}>
        <div className="h-1/3 bg-[#007229]" />
        <div className="h-1/3 bg-[#F59E0B]" />
        <div className="h-1/3 bg-[#D21034]" />
      </div>

      {/* Floating decorations */}
      <svg className="absolute top-[8%] right-[6%] w-5 h-5 text-[#F59E0B]/30" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.4 5.6 21.2 8 14 2 9.2h7.6z" />
      </svg>
      <div className="absolute bottom-[10%] right-[8%] w-3 h-3 rounded-full bg-[#D21034]/15" />

      <div className={`flex-1 flex ${isHorizontal ? (layout === 'image_left' ? 'flex-row' : 'flex-row-reverse') : ''} gap-2 p-6 sm:p-10 md:p-12`}>
        {/* Image panel for horizontal layouts */}
        {hasImage && isHorizontal && (
          <div className="w-2/5 flex-shrink-0 flex items-center">
            <SlideImage src={slide.image_url!} className="w-full h-full max-h-full shadow-md" />
          </div>
        )}

        <div className="flex-1 flex flex-col justify-center">
          <h2 className={`font-fredoka font-bold text-gray-900 mb-4 sm:mb-6 ${getSlideTitleClasses(slide.title_size)} ${isAr ? 'font-cairo' : ''}`}>
            {title}
          </h2>

          <div className="space-y-2 sm:space-y-3">
            {bullets.map((bullet, i) => {
              const color = BULLET_COLORS[i % BULLET_COLORS.length];
              return (
                <div key={i} className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-xl ${color.bg} text-white flex items-center justify-center text-sm sm:text-base font-bold shadow-sm`}>
                    {i + 1}
                  </div>
                  <div className={`flex-1 ${color.card} border rounded-xl px-3 py-2 sm:px-4 sm:py-2.5 text-gray-800 ${getSlideBodyClasses(slide.body_size, 'list')} ${isAr ? 'font-cairo' : 'font-inter'}`}>
                    {bullet}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Owl or image in default layout */}
        {!isHorizontal && (
          <div className="hidden sm:flex items-center flex-shrink-0 w-16 md:w-20">
            {hasImage ? (
              <SlideImage src={slide.image_url!} className="w-full h-auto max-h-full shadow-md" objectFit="contain" />
            ) : (
              <OwlPointing />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
