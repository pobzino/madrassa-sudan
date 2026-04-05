import type { Slide } from '@/lib/slides.types';

interface Props {
  slide: Slide;
  language: 'ar' | 'en';
}

export default function WhiteboardSlide({ slide, language }: Props) {
  const title = language === 'ar' ? slide.title_ar || slide.title_en : slide.title_en || slide.title_ar;

  return (
    <div className="relative w-full h-full bg-white">
      {/* Light grid pattern */}
      <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="wb-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.8" fill="#E5E7EB" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#wb-grid)" />
      </svg>

      {/* Subtle label */}
      <div className="absolute top-3 left-4 z-[1]">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-300">
          Whiteboard
        </span>
      </div>

      {/* Optional title */}
      {title && (
        <div className="absolute top-3 right-4 z-[1]">
          <span
            dir={language === 'ar' ? 'rtl' : 'ltr'}
            className={`text-xs font-medium text-gray-400 ${language === 'ar' ? 'font-cairo' : 'font-inter'}`}
          >
            {title}
          </span>
        </div>
      )}
    </div>
  );
}
