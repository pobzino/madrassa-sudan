import type { Slide } from '@/lib/slides.types';
import SlideCard from './SlideCard';

interface SlideThumbnailProps {
  slide: Slide;
  language: 'ar' | 'en';
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

export default function SlideThumbnail({
  slide,
  language,
  index,
  isSelected,
  onSelect,
  onDragStart,
  onDragOver,
  onDrop,
}: SlideThumbnailProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => { e.preventDefault(); onDragOver(e); }}
      onDrop={onDrop}
      onClick={onSelect}
      className={`
        cursor-pointer transition-all group
        ${isSelected ? 'ring-2 ring-[#007229] ring-offset-2 rounded-xl' : 'hover:ring-1 hover:ring-gray-300 hover:ring-offset-1 rounded-xl'}
      `}
    >
      <div className="relative flex justify-center">
        <div className="pointer-events-none">
          <SlideCard slide={slide} language={language} renderMode="thumbnail" className="!shadow-sm" />
        </div>
        {/* Slide number badge */}
        <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-black/50 text-white text-[10px] font-bold flex items-center justify-center">
          {index + 1}
        </div>
      </div>
    </div>
  );
}
