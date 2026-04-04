import type { Slide } from '@/lib/slides.types';
import { GripVertical } from 'lucide-react';
import SlideCard from './SlideCard';

interface SlideThumbnailProps {
  slide: Slide;
  language: 'ar' | 'en';
  index: number;
  draggable?: boolean;
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
  draggable = true,
  isSelected,
  onSelect,
  onDragStart,
  onDragOver,
  onDrop,
}: SlideThumbnailProps) {
  return (
    <div
      draggable={draggable}
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
        {/* Drag handle — visible on hover */}
        {draggable && (
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-full px-1.5 py-0.5 flex items-center gap-0.5 cursor-grab active:cursor-grabbing">
            <GripVertical className="w-3 h-3 text-white" />
          </div>
        )}
        {slide.is_required && (
          <div className="absolute top-1 right-1 rounded-full bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-semibold text-white">
            Locked
          </div>
        )}
      </div>
    </div>
  );
}
