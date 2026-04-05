'use client';

import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';

import type { SlideInteractionHotspot } from '@/lib/slides.types';

interface DragDropLabelDnDProps {
  imageUrl: string | null;
  items: string[];
  hotspots: SlideInteractionHotspot[];
  selections: Record<number, number>;
  onSelectionsChange: (next: Record<number, number>) => void;
  disabled: boolean;
  isAr: boolean;
}

function DraggableLabel({
  id,
  label,
  isAr,
  disabled,
}: {
  id: string;
  label: string;
  isAr: boolean;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`rounded-2xl border-2 border-[#007229] bg-white px-3 py-2 text-sm font-medium text-gray-800 select-none ${
        isDragging ? 'opacity-40' : 'cursor-grab active:cursor-grabbing'
      } ${isAr ? 'font-cairo' : 'font-inter'} ${disabled ? 'opacity-50 cursor-default' : ''}`}
      style={{ touchAction: 'none' }}
    >
      {label}
    </div>
  );
}

function HotspotDropZone({
  id,
  index,
  hotspot,
  placedLabel,
  isAr,
  onRemove,
  disabled,
}: {
  id: string;
  index: number;
  hotspot: SlideInteractionHotspot;
  placedLabel: string | null;
  isAr: boolean;
  onRemove: () => void;
  disabled: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{
        left: `${hotspot.x_percent}%`,
        top: `${hotspot.y_percent}%`,
      }}
    >
      {placedLabel ? (
        <div
          className={`flex items-center gap-1 rounded-full border-2 border-[#007229] bg-white px-3 py-1 text-xs font-semibold text-[#007229] shadow ${
            isAr ? 'font-cairo' : 'font-inter'
          }`}
        >
          <span>{placedLabel}</span>
          {!disabled && (
            <button
              type="button"
              onClick={onRemove}
              className="text-gray-400 hover:text-red-500"
              aria-label="remove"
            >
              ×
            </button>
          )}
        </div>
      ) : (
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold shadow transition-colors ${
            isOver
              ? 'border-[#007229] bg-[#007229]/10 text-[#007229] scale-110'
              : 'border-dashed border-[#007229]/70 bg-white/80 text-[#007229]'
          }`}
        >
          {index + 1}
        </div>
      )}
    </div>
  );
}

export default function DragDropLabelDnD({
  imageUrl,
  items,
  hotspots,
  selections,
  onSelectionsChange,
  disabled,
  isAr,
}: DragDropLabelDnDProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  const placedItemIndexes = new Set(Object.keys(selections).map(Number));
  const occupiedHotspots = new Set(Object.values(selections));

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const itemIndex = Number(String(active.id).replace('label-', ''));
    const hotspotIndex = Number(String(over.id).replace('hotspot-', ''));
    if (Number.isNaN(itemIndex) || Number.isNaN(hotspotIndex)) return;

    // If hotspot is already occupied by a different label, block the drop.
    if (
      occupiedHotspots.has(hotspotIndex) &&
      selections[itemIndex] !== hotspotIndex
    ) {
      return;
    }

    onSelectionsChange({ ...selections, [itemIndex]: hotspotIndex });
  }

  function removeFromHotspot(itemIndex: number) {
    const next = { ...selections };
    delete next[itemIndex];
    onSelectionsChange(next);
  }

  const activeItemIndex = activeId ? Number(activeId.replace('label-', '')) : null;
  const activeLabel = activeItemIndex !== null ? items[activeItemIndex] : null;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="space-y-3">
        <div
          className="relative aspect-video w-full overflow-hidden rounded-2xl border-2 border-gray-200 bg-gray-100"
          style={{
            backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
          }}
        >
          {!imageUrl && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">
              {isAr ? 'لا توجد صورة' : 'No image'}
            </div>
          )}
          {hotspots.map((hotspot, hotspotIndex) => {
            const placedEntry = Object.entries(selections).find(
              ([, hIdx]) => hIdx === hotspotIndex
            );
            const placedItemIndex = placedEntry ? Number(placedEntry[0]) : null;
            const placedLabel =
              placedItemIndex !== null ? items[placedItemIndex] : null;

            return (
              <HotspotDropZone
                key={hotspotIndex}
                id={`hotspot-${hotspotIndex}`}
                index={hotspotIndex}
                hotspot={hotspot}
                placedLabel={placedLabel}
                isAr={isAr}
                disabled={disabled}
                onRemove={() => {
                  if (placedItemIndex !== null) {
                    removeFromHotspot(placedItemIndex);
                  }
                }}
              />
            );
          })}
        </div>

        {placedItemIndexes.size < items.length && (
          <div className="flex flex-wrap gap-2">
            {items.map((item, index) =>
              placedItemIndexes.has(index) ? null : (
                <DraggableLabel
                  key={index}
                  id={`label-${index}`}
                  label={item}
                  isAr={isAr}
                  disabled={disabled}
                />
              )
            )}
          </div>
        )}
      </div>

      <DragOverlay>
        {activeLabel ? (
          <div
            className={`rounded-2xl border-2 border-[#007229] bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-lg ${
              isAr ? 'font-cairo' : 'font-inter'
            }`}
          >
            {activeLabel}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
