import type { Slide } from '@/lib/slides.types';
import { OwlPointing } from '@/components/illustrations';
import SlideImage from './SlideImage';
import { getSlideBodyClasses, getSlideTitleClasses } from '../slideText';
import { getSlideLanguageBlock } from './bilingual';
import { computeRevealState, isNewlyRevealedIndex } from '../revealCounts';

interface Props {
  slide: Slide;
  language: 'ar' | 'en';
  revealedCount?: number;
  onReveal?: () => void;
}

const BULLET_COLORS = [
  { bg: 'bg-[#007229]', card: 'bg-emerald-50 border-emerald-200' },
  { bg: 'bg-[#D21034]', card: 'bg-red-50 border-red-200' },
  { bg: 'bg-[#F59E0B]', card: 'bg-amber-50 border-amber-200' },
  { bg: 'bg-violet-500', card: 'bg-violet-50 border-violet-200' },
  { bg: 'bg-cyan-500', card: 'bg-cyan-50 border-cyan-200' },
  { bg: 'bg-pink-500', card: 'bg-pink-50 border-pink-200' },
];

export default function KeyPointsSlide({ slide, language, revealedCount, onReveal }: Props) {
  const primary = getSlideLanguageBlock(slide, language);
  const hasImage = !!slide.image_url;
  const layout = slide.layout || 'default';
  const isHorizontal = layout === 'image_left' || layout === 'image_right';
  const reveal = computeRevealState(primary.bullets, revealedCount, onReveal);

  return (
    <div className="relative w-full h-full bg-gradient-to-br from-green-50 via-white to-emerald-50 flex overflow-hidden">
      <div className="w-2 flex-shrink-0">
        <div className="h-1/3 bg-[#007229]" />
        <div className="h-1/3 bg-[#F59E0B]" />
        <div className="h-1/3 bg-[#D21034]" />
      </div>

      <svg className="absolute top-[8%] right-[6%] w-5 h-5 text-[#F59E0B]/30" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.4 5.6 21.2 8 14 2 9.2h7.6z" />
      </svg>
      <div className="absolute bottom-[10%] right-[8%] w-3 h-3 rounded-full bg-[#D21034]/15" />

      <div className={`flex-1 flex ${isHorizontal ? (layout === 'image_left' ? 'flex-row' : 'flex-row-reverse') : ''} gap-2 p-6 sm:p-10 md:p-12`}>
        {hasImage && isHorizontal && (
          <div className="w-2/5 flex-shrink-0 flex items-center">
            <SlideImage
              src={slide.image_url!}
              className="w-full h-full max-h-full shadow-md"
              objectFit={slide.image_fit ?? 'contain'}
              positionX={slide.image_position_x}
              positionY={slide.image_position_y}
              zoom={slide.image_zoom}
            />
          </div>
        )}

        <div className="flex-1 flex flex-col justify-center">
          <h2
            dir={primary.dir}
            className={`mb-1 font-fredoka font-bold text-gray-900 ${getSlideTitleClasses(slide.title_size)} ${
              primary.isArabic ? 'font-cairo' : ''
            }`}
          >
            {primary.title}
          </h2>
          <div
            className={`space-y-2 ${reveal.canReveal ? 'cursor-pointer' : ''}`}
            onClick={reveal.canReveal ? onReveal : undefined}
          >
            {reveal.visibleItems.map((bullet, index) => {
              const color = BULLET_COLORS[index % BULLET_COLORS.length];
              const isNewlyRevealed = isNewlyRevealedIndex(reveal, index);

              return (
                <div
                  key={`${primary.language}-${index}`}
                  className={`flex items-start gap-3 ${isNewlyRevealed ? 'animate-pop-in' : ''}`}
                >
                  <div className={`flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-xl ${color.bg} text-white flex items-center justify-center text-sm sm:text-base font-bold shadow-sm`}>
                    {index + 1}
                  </div>
                  <div
                    dir={primary.dir}
                    className={`flex-1 ${color.card} border rounded-xl px-3 py-2 sm:px-4 sm:py-2.5 text-gray-800 ${getSlideBodyClasses(
                      slide.body_size,
                      'list'
                    )} ${primary.isArabic ? 'font-cairo' : 'font-inter'}`}
                  >
                    {bullet}
                  </div>
                </div>
              );
            })}
            {primary.bullets.length === 0 && (
              <div className="rounded-xl border border-dashed border-emerald-200 px-4 py-3 text-sm text-gray-400">
                {primary.isArabic ? 'لا توجد نقاط بعد.' : 'No points added.'}
              </div>
            )}
          </div>
        </div>

        {!isHorizontal && (
          <div className="hidden sm:flex items-center flex-shrink-0 w-16 md:w-20">
            {hasImage ? (
              <SlideImage
                src={slide.image_url!}
                className="w-full h-auto max-h-full shadow-md"
                objectFit={slide.image_fit ?? 'contain'}
                positionX={slide.image_position_x}
                positionY={slide.image_position_y}
                zoom={slide.image_zoom}
              />
            ) : (
              <OwlPointing />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
