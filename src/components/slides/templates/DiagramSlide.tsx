import type { Slide } from '@/lib/slides.types';
import { OwlThinking } from '@/components/illustrations';
import SlideImage, { SlideBackgroundImage } from './SlideImage';
import { getSlideBodyClasses, getSlideTitleClasses } from '../slideText';
import { getSlideLanguageBlocks } from './bilingual';

interface Props {
  slide: Slide;
  language: 'ar' | 'en';
}

function DiagramPanels({ slide, language, dark = false }: Props & { dark?: boolean }) {
  const blocks = getSlideLanguageBlocks(slide, language);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {blocks.map((block) => (
        <div
          key={block.language}
          dir={block.dir}
          className={`rounded-xl p-3 ${dark ? 'bg-white/10' : 'bg-white/75'}`}
        >
          <p
            className={`mb-2 text-xs font-semibold uppercase tracking-[0.18em] ${
              dark ? 'text-white/70' : 'text-cyan-700/70'
            }`}
          >
            {block.label}
          </p>
          <p
            className={`whitespace-pre-line ${dark ? 'text-white/95' : 'text-gray-700'} ${getSlideBodyClasses(
              slide.body_size,
              'compact'
            )} ${block.isArabic ? 'font-cairo' : 'font-inter'}`}
          >
            {block.body}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function DiagramSlide({ slide, language }: Props) {
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
        <div className="relative z-10 rounded-2xl bg-black/30 p-3 backdrop-blur-sm sm:p-4">
          <DiagramPanels slide={slide} language={language} dark />
        </div>
      </div>
    );
  }

  const isReversed = layout === 'image_right';

  return (
    <div className="relative w-full h-full bg-gradient-to-br from-cyan-50 via-white to-sky-50 flex flex-col overflow-hidden">
      <div className="h-2 bg-gradient-to-r from-cyan-400 via-[#007229] to-[#F59E0B] flex-shrink-0" />
      <div className="absolute top-[20%] left-[4%] w-3 h-3 rounded-full bg-cyan-300/40" />
      <div className="absolute top-[12%] right-[15%] w-2 h-2 rounded-full bg-[#F59E0B]/30" />
      <div className="absolute bottom-[15%] left-[10%] w-2 h-2 rounded-full bg-[#007229]/20" />

      {layout === 'image_top' && hasImage ? (
        <div className="flex-1 flex flex-col p-6 sm:p-10 md:p-12 gap-4">
          <div className="flex-shrink-0 h-2/5">
            <SlideImage src={slide.image_url!} className="w-full h-full shadow-md" />
          </div>
          <div className="flex-1 flex flex-col justify-center">
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
              className={`mb-3 text-cyan-900/75 ${getSlideTitleClasses(slide.title_size)} ${
                secondary.isArabic ? 'font-cairo' : 'font-inter'
              }`}
            >
              {secondary.title}
            </p>
            <div className="rounded-2xl border border-cyan-100 bg-white/80 p-4 shadow-sm">
              <DiagramPanels slide={slide} language={language} />
            </div>
          </div>
        </div>
      ) : (
        <div className={`flex-1 flex ${isReversed ? 'flex-row-reverse' : 'flex-row'} p-6 sm:p-10 md:p-12 gap-4 sm:gap-6`}>
          <div className="flex-1 flex flex-col justify-center">
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
              className={`mb-3 text-cyan-900/75 ${getSlideTitleClasses(slide.title_size)} ${
                secondary.isArabic ? 'font-cairo' : 'font-inter'
              }`}
            >
              {secondary.title}
            </p>
            <div className="rounded-2xl border border-cyan-100 bg-white/80 p-4 shadow-sm">
              <DiagramPanels slide={slide} language={language} />
            </div>
            <div className="mt-3 w-12 h-12 sm:w-14 sm:h-14 self-start">
              <OwlThinking />
            </div>
          </div>

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
