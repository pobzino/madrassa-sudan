/* eslint-disable @next/next/no-img-element */
import { isOwlImage } from '@/lib/owl-illustrations';
import OwlImage from '../OwlImage';

interface SlideImageProps {
  src: string;
  className?: string;
  objectFit?: 'cover' | 'contain';
}

export default function SlideImage({ src, className = '', objectFit = 'cover' }: SlideImageProps) {
  if (isOwlImage(src)) {
    return <OwlImage url={src} className={className} />;
  }
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
  if (isOwlImage(src)) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-emerald-100 to-green-50">
        <OwlImage url={src} className="w-40 h-40 opacity-30" />
      </div>
    );
  }
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
