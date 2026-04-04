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

interface MatchPairsDnDProps {
  items: string[];
  targets: string[];
  selections: Record<number, number>;
  onSelectionsChange: (next: Record<number, number>) => void;
  disabled: boolean;
  isAr: boolean;
}

function DraggableItem({
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
      className={`rounded-2xl border-2 border-[#007229] bg-white px-4 py-3 text-sm font-medium text-gray-800 select-none ${
        isDragging ? 'opacity-40' : 'cursor-grab active:cursor-grabbing'
      } ${isAr ? 'font-cairo' : 'font-inter'} ${disabled ? 'opacity-50 cursor-default' : ''}`}
      style={{ touchAction: 'none' }}
    >
      {label}
    </div>
  );
}

function DroppableZone({
  id,
  label,
  placedItemLabel,
  isAr,
  isOver,
  onRemove,
  disabled,
}: {
  id: string;
  label: string;
  placedItemLabel: string | null;
  isAr: boolean;
  isOver: boolean;
  onRemove: () => void;
  disabled: boolean;
}) {
  const { setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[48px] rounded-2xl border-2 px-4 py-3 transition-colors ${
        placedItemLabel
          ? 'border-[#007229] bg-[#007229]/8'
          : isOver
            ? 'border-[#007229]/60 bg-[#007229]/5 border-solid'
            : 'border-dashed border-gray-300 bg-gray-50'
      }`}
    >
      <p className={`mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 ${isAr ? 'font-cairo' : ''}`}>
        {label}
      </p>
      {placedItemLabel ? (
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm font-medium text-[#007229] ${isAr ? 'font-cairo' : 'font-inter'}`}>
            {placedItemLabel}
          </span>
          {!disabled && (
            <button
              onClick={onRemove}
              className="text-xs font-bold text-gray-400 hover:text-red-500"
            >
              ×
            </button>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-400">
          {isAr ? 'اسحب هنا' : 'Drop here'}
        </p>
      )}
    </div>
  );
}

export default function MatchPairsDnD({
  items,
  targets,
  selections,
  onSelectionsChange,
  disabled,
  isAr,
}: MatchPairsDnDProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  // Items that haven't been placed yet
  const placedItemIndexes = new Set(Object.keys(selections).map(Number));
  // Targets that already have an item placed on them
  const occupiedTargets = new Set(Object.values(selections));

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const itemIndex = Number(String(active.id).replace('item-', ''));
    const targetIndex = Number(String(over.id).replace('target-', ''));
    if (isNaN(itemIndex) || isNaN(targetIndex)) return;

    // If target is already occupied by another item, don't allow
    if (occupiedTargets.has(targetIndex) && selections[itemIndex] !== targetIndex) return;

    onSelectionsChange({ ...selections, [itemIndex]: targetIndex });
  }

  function removeFromTarget(itemIndex: number) {
    const next = { ...selections };
    delete next[itemIndex];
    onSelectionsChange(next);
  }

  const activeItemIndex = activeId ? Number(activeId.replace('item-', '')) : null;
  const activeLabel = activeItemIndex !== null ? items[activeItemIndex] : null;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-3">
        {/* Unplaced items pool — hidden when all placed */}
        {placedItemIndexes.size < items.length && (
          <div className="flex flex-wrap gap-2">
            {items.map((item, index) =>
              placedItemIndexes.has(index) ? null : (
                <DraggableItem
                  key={index}
                  id={`item-${index}`}
                  label={item}
                  isAr={isAr}
                  disabled={disabled}
                />
              )
            )}
          </div>
        )}

        {/* Drop zones */}
        <div className="space-y-2">
          {targets.map((target, targetIndex) => {
            const placedItemIndex = Object.entries(selections).find(
              ([, tIdx]) => tIdx === targetIndex
            )?.[0];
            const placedLabel =
              placedItemIndex !== undefined ? items[Number(placedItemIndex)] : null;

            return (
              <DroppableZone
                key={targetIndex}
                id={`target-${targetIndex}`}
                label={target}
                placedItemLabel={placedLabel}
                isAr={isAr}
                isOver={false}
                onRemove={() => {
                  if (placedItemIndex !== undefined) {
                    removeFromTarget(Number(placedItemIndex));
                  }
                }}
                disabled={disabled}
              />
            );
          })}
        </div>
      </div>

      <DragOverlay>
        {activeLabel ? (
          <div
            className={`rounded-2xl border-2 border-[#007229] bg-white px-4 py-3 text-sm font-medium text-gray-800 shadow-lg ${isAr ? 'font-cairo' : 'font-inter'}`}
          >
            {activeLabel}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
