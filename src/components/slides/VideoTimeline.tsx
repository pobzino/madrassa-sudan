'use client';

import { useRef, useCallback, useState, useEffect } from 'react';
import type { CutRegion } from '@/lib/ffmpeg-editor';

interface VideoTimelineProps {
  duration: number;
  currentTime: number;
  trimStart: number;
  trimEnd: number;
  cutRegions: CutRegion[];
  onSeek: (time: number) => void;
  onTrimStartChange: (time: number) => void;
  onTrimEndChange: (time: number) => void;
  onCutRegionUpdate: (index: number, region: CutRegion) => void;
  onCutRegionRemove: (index: number) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type DragTarget =
  | { type: 'trimStart' }
  | { type: 'trimEnd' }
  | { type: 'cutStart'; index: number }
  | { type: 'cutEnd'; index: number }
  | { type: 'cutMove'; index: number; offsetSeconds: number };

export default function VideoTimeline({
  duration,
  currentTime,
  trimStart,
  trimEnd,
  cutRegions,
  onSeek,
  onTrimStartChange,
  onTrimEndChange,
  onCutRegionUpdate,
  onCutRegionRemove,
}: VideoTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);
  const [hoveredCut, setHoveredCut] = useState<number | null>(null);

  const timeFromX = useCallback((clientX: number): number => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * duration;
  }, [duration]);

  const pctFromTime = useCallback((time: number): number => {
    if (duration <= 0) return 0;
    return (time / duration) * 100;
  }, [duration]);

  // Global mouse move/up for dragging
  useEffect(() => {
    if (!dragTarget) return;

    const handleMove = (e: MouseEvent) => {
      const time = timeFromX(e.clientX);

      switch (dragTarget.type) {
        case 'trimStart':
          onTrimStartChange(Math.max(0, Math.min(time, trimEnd - 0.5)));
          break;
        case 'trimEnd':
          onTrimEndChange(Math.min(duration, Math.max(time, trimStart + 0.5)));
          break;
        case 'cutStart': {
          const region = cutRegions[dragTarget.index];
          if (region) {
            onCutRegionUpdate(dragTarget.index, {
              start: Math.max(trimStart, Math.min(time, region.end - 0.2)),
              end: region.end,
            });
          }
          break;
        }
        case 'cutEnd': {
          const region = cutRegions[dragTarget.index];
          if (region) {
            onCutRegionUpdate(dragTarget.index, {
              start: region.start,
              end: Math.min(trimEnd, Math.max(time, region.start + 0.2)),
            });
          }
          break;
        }
        case 'cutMove': {
          const region = cutRegions[dragTarget.index];
          if (region) {
            const width = region.end - region.start;
            let newStart = time - dragTarget.offsetSeconds;
            newStart = Math.max(trimStart, Math.min(newStart, trimEnd - width));
            onCutRegionUpdate(dragTarget.index, {
              start: newStart,
              end: newStart + width,
            });
          }
          break;
        }
      }
    };

    const handleUp = () => setDragTarget(null);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragTarget, duration, trimStart, trimEnd, cutRegions, timeFromX, onTrimStartChange, onTrimEndChange, onCutRegionUpdate]);

  const handleTrackClick = useCallback((e: React.MouseEvent) => {
    if (dragTarget) return;
    // Don't seek if clicking on a handle or cut region
    const target = e.target as HTMLElement;
    if (target.closest('[data-handle]') || target.closest('[data-cut]')) return;
    const time = timeFromX(e.clientX);
    onSeek(time);
  }, [dragTarget, timeFromX, onSeek]);

  return (
    <div className="select-none">
      {/* Time labels */}
      <div className="flex items-center justify-between mb-1 text-[11px] text-gray-500 font-mono">
        <span>{formatTime(trimStart)}</span>
        <span>{formatTime(trimEnd)}</span>
      </div>

      {/* Timeline track */}
      <div
        ref={trackRef}
        className="relative h-12 bg-gray-200 rounded-lg cursor-pointer overflow-hidden"
        onClick={handleTrackClick}
      >
        {/* Active region (between trim handles) */}
        <div
          className="absolute top-0 bottom-0 bg-emerald-100"
          style={{
            left: `${pctFromTime(trimStart)}%`,
            width: `${pctFromTime(trimEnd) - pctFromTime(trimStart)}%`,
          }}
        />

        {/* Dimmed regions outside trim */}
        <div
          className="absolute top-0 bottom-0 left-0 bg-gray-400/40"
          style={{ width: `${pctFromTime(trimStart)}%` }}
        />
        <div
          className="absolute top-0 bottom-0 right-0 bg-gray-400/40"
          style={{ width: `${100 - pctFromTime(trimEnd)}%` }}
        />

        {/* Cut regions */}
        {cutRegions.map((cut, i) => {
          const left = pctFromTime(cut.start);
          const width = pctFromTime(cut.end) - left;
          return (
            <div
              key={i}
              data-cut
              className="absolute top-0 bottom-0 group"
              style={{ left: `${left}%`, width: `${width}%` }}
              onMouseEnter={() => setHoveredCut(i)}
              onMouseLeave={() => setHoveredCut(null)}
            >
              {/* Cut fill with stripe pattern */}
              <div
                className="absolute inset-0 bg-red-400/50 cursor-move"
                style={{
                  backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.3) 3px, rgba(255,255,255,0.3) 6px)',
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  const offsetSeconds = timeFromX(e.clientX) - cut.start;
                  setDragTarget({ type: 'cutMove', index: i, offsetSeconds });
                }}
              />

              {/* Cut left edge handle */}
              <div
                data-handle
                className="absolute left-0 top-0 bottom-0 w-1.5 bg-red-600 cursor-ew-resize hover:bg-red-700"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setDragTarget({ type: 'cutStart', index: i });
                }}
              />

              {/* Cut right edge handle */}
              <div
                data-handle
                className="absolute right-0 top-0 bottom-0 w-1.5 bg-red-600 cursor-ew-resize hover:bg-red-700"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setDragTarget({ type: 'cutEnd', index: i });
                }}
              />

              {/* Delete button */}
              {hoveredCut === i && (
                <button
                  className="absolute -top-2 left-1/2 -translate-x-1/2 w-5 h-5 bg-red-600 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-700 shadow-sm z-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCutRegionRemove(i);
                  }}
                >
                  &times;
                </button>
              )}
            </div>
          );
        })}

        {/* Trim start handle */}
        <div
          data-handle
          className="absolute top-0 bottom-0 w-2.5 bg-amber-500 cursor-ew-resize hover:bg-amber-600 rounded-l-md z-20 flex items-center justify-center"
          style={{ left: `calc(${pctFromTime(trimStart)}% - 4px)` }}
          onMouseDown={(e) => {
            e.stopPropagation();
            setDragTarget({ type: 'trimStart' });
          }}
        >
          <div className="w-0.5 h-5 bg-white/70 rounded-full" />
        </div>

        {/* Trim end handle */}
        <div
          data-handle
          className="absolute top-0 bottom-0 w-2.5 bg-amber-500 cursor-ew-resize hover:bg-amber-600 rounded-r-md z-20 flex items-center justify-center"
          style={{ left: `calc(${pctFromTime(trimEnd)}% - 6px)` }}
          onMouseDown={(e) => {
            e.stopPropagation();
            setDragTarget({ type: 'trimEnd' });
          }}
        >
          <div className="w-0.5 h-5 bg-white/70 rounded-full" />
        </div>

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-gray-900 z-30 pointer-events-none"
          style={{ left: `${pctFromTime(currentTime)}%` }}
        >
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-gray-900 rounded-full" />
        </div>
      </div>

      {/* Current time */}
      <div className="flex items-center justify-between mt-1.5 text-[11px] text-gray-500 font-mono">
        <span>{formatTime(currentTime)}</span>
        <span className="text-gray-400">{formatTime(duration)}</span>
      </div>
    </div>
  );
}
