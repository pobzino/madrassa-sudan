/* eslint-disable @next/next/no-img-element */
import { isOwlImage } from '@/lib/owl-illustrations';
import OwlImage from '../OwlImage';

interface SlideImageProps {
  src: string;
  className?: string;
  objectFit?: 'cover' | 'contain';
  positionX?: number | null;
  positionY?: number | null;
}

function getObjectPosition(positionX?: number | null, positionY?: number | null): string {
  const x = typeof positionX === 'number' ? positionX : 50;
  const y = typeof positionY === 'number' ? positionY : 50;
  return `${x}% ${y}%`;
}

export default function SlideImage({
  src,
  className = '',
  objectFit = 'contain',
  positionX,
  positionY,
}: SlideImageProps) {
  if (isOwlImage(src)) {
    return <OwlImage url={src} className={className} />;
  }
  return (
    <img
      src={src}
      alt=""
      className={`rounded-2xl ${objectFit === 'cover' ? 'object-cover' : 'object-contain'} ${className}`}
      style={{ objectPosition: getObjectPosition(positionX, positionY) }}
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
}

export function SlideBackgroundImage({
  src,
  objectFit = 'cover',
  positionX,
  positionY,
}: {
  src: string;
  objectFit?: 'cover' | 'contain';
  positionX?: number | null;
  positionY?: number | null;
}) {
  if (isOwlImage(src)) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-emerald-100 to-green-50">
        <OwlImage url={src} className="w-40 h-40 opacity-30" />
      </div>
    );
  }
  return (
    <>
      <div className="absolute inset-0 bg-slate-900" />
      <img
        src={src}
        alt=""
        className={`absolute inset-0 h-full w-full ${objectFit === 'cover' ? 'object-cover' : 'object-contain'}`}
        style={{ objectPosition: getObjectPosition(positionX, positionY) }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
      <div className="absolute inset-0 bg-black/50" />
    </>
  );
}
