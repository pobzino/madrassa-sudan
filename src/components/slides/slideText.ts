import type { SlideTextSize } from '@/lib/slides.types';

type TitleVariant = 'hero' | 'standard';
type BodyVariant = 'standard' | 'compact' | 'list';

function normalizeSize(size?: SlideTextSize | null): SlideTextSize {
  return size ?? 'md';
}

const TITLE_CLASSES: Record<TitleVariant, Record<SlideTextSize, string>> = {
  hero: {
    sm: 'text-xl sm:text-2xl md:text-3xl',
    md: 'text-2xl sm:text-4xl md:text-5xl',
    lg: 'text-3xl sm:text-5xl md:text-6xl',
    xl: 'text-4xl sm:text-6xl md:text-7xl',
  },
  standard: {
    sm: 'text-lg sm:text-xl md:text-2xl',
    md: 'text-xl sm:text-2xl md:text-3xl',
    lg: 'text-2xl sm:text-3xl md:text-4xl',
    xl: 'text-3xl sm:text-4xl md:text-5xl',
  },
};

const BODY_CLASSES: Record<BodyVariant, Record<SlideTextSize, string>> = {
  standard: {
    sm: 'text-xs sm:text-sm md:text-base',
    md: 'text-sm sm:text-lg md:text-xl',
    lg: 'text-base sm:text-xl md:text-2xl',
    xl: 'text-lg sm:text-2xl md:text-3xl',
  },
  compact: {
    sm: 'text-xs sm:text-sm md:text-base',
    md: 'text-sm sm:text-base md:text-lg',
    lg: 'text-base sm:text-lg md:text-xl',
    xl: 'text-lg sm:text-xl md:text-2xl',
  },
  list: {
    sm: 'text-xs sm:text-sm md:text-base',
    md: 'text-sm sm:text-base md:text-lg',
    lg: 'text-base sm:text-lg md:text-xl',
    xl: 'text-lg sm:text-xl md:text-2xl',
  },
};

export function getSlideTitleClasses(size?: SlideTextSize | null, variant: TitleVariant = 'standard'): string {
  return TITLE_CLASSES[variant][normalizeSize(size)];
}

export function getSlideBodyClasses(size?: SlideTextSize | null, variant: BodyVariant = 'standard'): string {
  return BODY_CLASSES[variant][normalizeSize(size)];
}
