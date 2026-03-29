/* eslint-disable @next/next/no-img-element */

interface SlideImageProps {
  src: string;
  className?: string;
  objectFit?: 'cover' | 'contain';
}

export default function SlideImage({ src, className = '', objectFit = 'cover' }: SlideImageProps) {
  return (
    <img
      src={src}
      alt=""
      className={`rounded-2xl ${objectFit === 'cover' ? 'object-cover' : 'object-contain'} ${className}`}
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
}

export function SlideBackgroundImage({ src }: { src: string }) {
  return (
    <>
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
