/* eslint-disable @next/next/no-img-element */
import { isOwlImage } from '@/lib/owl-illustrations';
import OwlImage from '../OwlImage';
import type { SlideImageFit } from '@/lib/slides.types';
import type { CSSProperties } from 'react';

interface SlideImageProps {
  src: string;
  className?: string;
  objectFit?: SlideImageFit;
  positionX?: number | null;
  positionY?: number | null;
  zoom?: number | null;
}

function getObjectPosition(positionX?: number | null, positionY?: number | null): string {
  const x = typeof positionX === 'number' ? positionX : 50;
  const y = typeof positionY === 'number' ? positionY : 50;
  return `${x}% ${y}%`;
}

function getObjectFitClass(objectFit: SlideImageFit): string {
  switch (objectFit) {
    case 'cover':
      return 'object-cover';
    case 'fill':
      return 'object-fill';
    case 'contain':
    default:
      return 'object-contain';
  }
}

function getImageZoom(zoom?: number | null): number {
  return typeof zoom === 'number' && Number.isFinite(zoom)
    ? Math.max(0.5, Math.min(3, zoom))
    : 1;
}

function getImageStyle(
  positionX?: number | null,
  positionY?: number | null,
  zoom?: number | null
): CSSProperties {
  return {
    objectPosition: getObjectPosition(positionX, positionY),
    transform: `translateZ(0) scale(${getImageZoom(zoom)})`,
    transformOrigin: getObjectPosition(positionX, positionY),
    backfaceVisibility: 'hidden',
  };
}

export default function SlideImage({
  src,
  className = '',
  objectFit = 'contain',
  positionX,
  positionY,
  zoom,
}: SlideImageProps) {
  if (isOwlImage(src)) {
    return <OwlImage url={src} className={className} />;
  }
  return (
    <img
      src={src}
      alt=""
      decoding="async"
      draggable={false}
      className={`block rounded-2xl ${getObjectFitClass(objectFit)} ${className}`}
      style={getImageStyle(positionX, positionY, zoom)}
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
}

export function SlideBackgroundImage({
  src,
  objectFit = 'cover',
  positionX,
  positionY,
  zoom,
}: {
  src: string;
  objectFit?: SlideImageFit;
  positionX?: number | null;
  positionY?: number | null;
  zoom?: number | null;
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
        decoding="async"
        draggable={false}
        className={`absolute h-full w-full ${getObjectFitClass(objectFit)}`}
        style={{
          inset: objectFit === 'contain' ? 0 : -1,
          width: objectFit === 'contain' ? '100%' : 'calc(100% + 2px)',
          height: objectFit === 'contain' ? '100%' : 'calc(100% + 2px)',
          ...getImageStyle(positionX, positionY, zoom),
        }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
      <div className="absolute inset-0 bg-black/50" />
    </>
  );
}
