import type { Slide } from '@/lib/slides.types';
import { OwlReading } from '@/components/illustrations';
import SlideImage, { SlideBackgroundImage } from './SlideImage';
import { getSlideBodyClasses, getSlideTitleClasses } from '../slideText';
import { getSlideLanguageBlocks } from './bilingual';

interface Props {
  slide: Slide;
  language: 'ar' | 'en';
}

function BilingualPanels({ slide, language, dark = false }: Props & { dark?: boolean }) {
  const blocks = getSlideLanguageBlocks(slide, language);

  return (
    <div className={`grid gap-3 md:grid-cols-2 ${dark ? '' : ''}`}>
      {blocks.map((block) => (
        <div
          key={block.language}
          dir={block.dir}
          className={`rounded-xl p-3 ${dark ? 'bg-white/10' : 'bg-white/75'}`}
        >
          <p
            className={`mb-2 text-xs font-semibold uppercase tracking-[0.18em] ${
              dark ? 'text-white/70' : 'text-emerald-700/70'
            }`}
          >
            {block.label}
          </p>
          <p
            className={`whitespace-pre-line ${dark ? 'text-white/95' : 'text-gray-700'} ${getSlideBodyClasses(
              slide.body_size
            )} ${block.isArabic ? 'font-cairo' : 'font-inter'}`}
          >
            {block.body}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function ContentSlide({ slide, language }: Props) {
  const [primary, secondary] = getSlideLanguageBlocks(slide, language);
  const hasImage = !!slide.image_url;
  const layout = slide.layout || 'default';

  if (layout === 'full_image' && hasImage) {
    return (
      <div className="relative w-full h-full flex flex-col justify-end p-8 sm:p-12 overflow-hidden">
        <SlideBackgroundImage src={slide.image_url!} />
        <h2
          dir={primary.dir}
          className={`relative z-10 mb-1 font-fredoka font-bold text-white drop-shadow-lg ${getSlideTitleClasses(
            slide.title_size
          )} ${primary.isArabic ? 'font-cairo' : ''}`}
        >
          {primary.title}
        </h2>
        <p
          dir={secondary.dir}
          className={`relative z-10 mb-3 text-white/85 ${getSlideTitleClasses(slide.title_size)} ${
            secondary.isArabic ? 'font-cairo' : 'font-inter'
          }`}
        >
          {secondary.title}
        </p>
        <div className="relative z-10 rounded-2xl bg-black/30 p-4 backdrop-blur-sm sm:p-6">
          <BilingualPanels slide={slide} language={language} dark />
        </div>
      </div>
    );
  }

  const isHorizontal = layout === 'image_left' || layout === 'image_right';
  const isImageTop = layout === 'image_top';

  return (
    <div className="relative w-full h-full bg-gradient-to-br from-emerald-50 via-white to-green-50 flex flex-col overflow-hidden">
      <div className="h-2 bg-gradient-to-r from-[#007229] via-[#F59E0B] to-[#D21034] flex-shrink-0" />
      <div className="absolute top-[15%] right-[5%] w-3 h-3 rounded-full bg-[#F59E0B]/30" />
      <div className="absolute top-[25%] right-[10%] w-2 h-2 rounded-full bg-[#007229]/20" />
      <svg className="absolute bottom-[15%] left-[5%] w-5 h-5 text-[#007229]/15" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.4 5.6 21.2 8 14 2 9.2h7.6z" />
      </svg>
      <div className="absolute bottom-[-40px] right-[-40px] w-[160px] h-[160px] rounded-full bg-[#007229]/5" />

      <div className={`flex-1 flex ${isHorizontal ? (layout === 'image_left' ? 'flex-row' : 'flex-row-reverse') : 'flex-col'} gap-4 p-6 sm:p-10 md:p-14`}>
        {hasImage && (isHorizontal || isImageTop) && (
          <div className={isHorizontal ? 'w-2/5 flex-shrink-0 flex items-center' : 'flex-shrink-0 h-1/3'}>
            <SlideImage src={slide.image_url!} className={`w-full ${isHorizontal ? 'h-full max-h-full' : 'h-full'} shadow-md`} />
          </div>
        )}

        <div className="flex-1 flex flex-col justify-center min-w-0">
          <h2
            dir={primary.dir}
            className={`mb-1 font-fredoka font-bold text-gray-900 ${getSlideTitleClasses(slide.title_size)} ${
              primary.isArabic ? 'font-cairo' : ''
            }`}
          >
            {primary.title}
          </h2>
          <p
            dir={secondary.dir}
            className={`mb-4 text-emerald-900/75 ${getSlideTitleClasses(slide.title_size)} ${
              secondary.isArabic ? 'font-cairo' : 'font-inter'
            }`}
          >
            {secondary.title}
          </p>
          <div className="rounded-2xl border border-emerald-100 bg-white/80 p-4 shadow-sm sm:p-6">
            <BilingualPanels slide={slide} language={language} />
          </div>
        </div>

        {!hasImage && !isHorizontal && !isImageTop && (
          <div className="hidden sm:flex items-end flex-shrink-0 w-20 md:w-24 pb-4">
            <OwlReading />
          </div>
        )}

        {hasImage && !isHorizontal && !isImageTop && (
          <div className="hidden sm:flex items-center flex-shrink-0 w-28 md:w-36">
            <SlideImage src={slide.image_url!} className="w-full h-auto max-h-full shadow-md" objectFit="contain" />
          </div>
        )}
      </div>
    </div>
  );
}
