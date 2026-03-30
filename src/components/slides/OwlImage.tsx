'use client';

import { getOwlKey, isOwlImage } from '@/lib/owl-illustrations';
import {
  OwlWaving,
  OwlCelebrating,
  OwlThinking,
  OwlReading,
  OwlExcited,
  OwlPointing,
  OwlTeacher,
  OwlWriting,
  OwlCorrect,
  OwlWrong,
  OwlEncouraging,
  OwlConfused,
  OwlSad,
  OwlSleeping,
  OwlWelcome,
  OwlBye,
  OwlMath,
  OwlScience,
  OwlEnglish,
  OwlStreak,
  OwlMedal,
  OwlHead,
} from '@/components/illustrations';

const OWL_COMPONENTS: Record<string, React.FC<{ className?: string }>> = {
  OwlWaving,
  OwlCelebrating,
  OwlThinking,
  OwlReading,
  OwlExcited,
  OwlPointing,
  OwlTeacher,
  OwlWriting,
  OwlCorrect,
  OwlWrong,
  OwlEncouraging,
  OwlConfused,
  OwlSad,
  OwlSleeping,
  OwlWelcome,
  OwlBye,
  OwlMath,
  OwlScience,
  OwlEnglish,
  OwlStreak,
  OwlMedal,
  OwlHead,
};

interface OwlImageProps {
  url: string;
  className?: string;
}

/** Renders an owl SVG component from an "owl:ComponentName" URL. */
export default function OwlImage({ url, className = '' }: OwlImageProps) {
  const key = getOwlKey(url);
  const Component = OWL_COMPONENTS[key];
  if (!Component) return null;
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <Component />
    </div>
  );
}

/** Helper: check if an image_url is an owl and render accordingly, else render <img>. */
export function SlideOwlOrImage({
  src,
  className = '',
  objectFit = 'cover',
}: {
  src: string;
  className?: string;
  objectFit?: 'cover' | 'contain';
}) {
  if (isOwlImage(src)) {
    return <OwlImage url={src} className={className} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={`rounded-2xl ${objectFit === 'cover' ? 'object-cover' : 'object-contain'} ${className}`}
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
}

/** Background variant for full_image layout */
export function SlideOwlOrBackgroundImage({ src }: { src: string }) {
  if (isOwlImage(src)) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-emerald-100 to-green-50">
        <OwlImage url={src} className="w-40 h-40 opacity-30" />
      </div>
    );
  }
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
      <div className="absolute inset-0 bg-black/50" />
    </>
  );
}

export { OWL_COMPONENTS, isOwlImage };
