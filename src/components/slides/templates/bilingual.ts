import type { Slide } from '@/lib/slides.types';

export type SlideTemplateLanguage = 'ar' | 'en';

export type SlideLanguageBlock = {
  language: SlideTemplateLanguage;
  isArabic: boolean;
  label: string;
  dir: 'rtl' | 'ltr';
  title: string;
  body: string;
  bullets: string[];
};

export function getSlideLanguageBlocks(
  slide: Slide,
  preferredLanguage: SlideTemplateLanguage
): [SlideLanguageBlock, SlideLanguageBlock] {
  const order: SlideTemplateLanguage[] =
    preferredLanguage === 'en' ? ['en', 'ar'] : ['ar', 'en'];

  return order.map((language) => ({
    language,
    isArabic: language === 'ar',
    label: language === 'ar' ? 'العربية' : 'English',
    dir: language === 'ar' ? 'rtl' : 'ltr',
    title: language === 'ar' ? slide.title_ar : slide.title_en,
    body: language === 'ar' ? slide.body_ar : slide.body_en,
    bullets: (language === 'ar' ? slide.bullets_ar : slide.bullets_en) || [],
  })) as [SlideLanguageBlock, SlideLanguageBlock];
}
