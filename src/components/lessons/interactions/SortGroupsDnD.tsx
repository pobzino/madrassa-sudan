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

interface SortGroupsDnDProps {
  items: string[];
  groups: string[];
  selections: Record<number, number>;
  onSelectionsChange: (next: Record<number, number>) => void;
  disabled: boolean;
  isAr: boolean;
}

function DraggableChip({
  id,
  label,
  isAr,
  disabled,
  dimmed,
}: {
  id: string;
  label: string;
  isAr: boolean;
  disabled: boolean;
  dimmed: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    disabled: disabled || dimmed,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`rounded-2xl border px-4 py-3 text-sm font-medium select-none transition-colors ${
        dimmed
          ? 'border-gray-100 bg-gray-100 text-gray-300'
          : isDragging
            ? 'border-[#007229] bg-white text-gray-800 opacity-40'
            : 'border-gray-200 bg-white text-gray-800 cursor-grab active:cursor-grabbing'
      } ${isAr ? 'font-cairo' : 'font-inter'} ${disabled ? 'opacity-50 cursor-default' : ''}`}
      style={{ touchAction: 'none' }}
    >
      {label}
    </div>
  );
}

function GroupDropZone({
  id,
  label,
  placedItems,
  isAr,
  onRemoveItem,
  disabled,
}: {
  id: string;
  label: string;
  placedItems: { index: number; label: string }[];
  isAr: boolean;
  onRemoveItem: (itemIndex: number) => void;
  disabled: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[80px] rounded-2xl border-2 p-3 transition-colors ${
        isOver
          ? 'border-[#007229]/60 bg-[#007229]/5 border-solid'
          : placedItems.length > 0
            ? 'border-[#007229]/30 bg-white'
            : 'border-dashed border-gray-300 bg-gray-50'
      }`}
    >
      <p className={`mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 ${isAr ? 'font-cairo' : ''}`}>
        {label}
      </p>
      {placedItems.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {placedItems.map((item) => (
            <div
              key={item.index}
              className={`flex items-center gap-1.5 rounded-xl border border-[#007229]/30 bg-[#007229]/8 px-3 py-1.5 text-sm font-medium text-[#007229] ${isAr ? 'font-cairo' : 'font-inter'}`}
            >
              {item.label}
              {!disabled && (
                <button
                  onClick={() => onRemoveItem(item.index)}
                  className="text-xs font-bold text-[#007229]/50 hover:text-red-500"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400">
          {isAr ? 'اسحب العناصر هنا' : 'Drag items here'}
        </p>
      )}
    </div>
  );
}

export default function SortGroupsDnD({
  items,
  groups,
  selections,
  onSelectionsChange,
  disabled,
  isAr,
}: SortGroupsDnDProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  const placedIndexes = new Set(Object.keys(selections).map(Number));

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const itemIndex = Number(String(active.id).replace('sort-item-', ''));
    const groupIndex = Number(String(over.id).replace('group-', ''));
    if (isNaN(itemIndex) || isNaN(groupIndex)) return;

    onSelectionsChange({ ...selections, [itemIndex]: groupIndex });
  }

  function removeItem(itemIndex: number) {
    const next = { ...selections };
    delete next[itemIndex];
    onSelectionsChange(next);
  }

  const activeItemIndex = activeId ? Number(activeId.replace('sort-item-', '')) : null;
  const activeLabel = activeItemIndex !== null ? items[activeItemIndex] : null;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-4">
        {/* Unplaced items pool */}
        <div className="flex flex-wrap gap-2">
          {items.map((item, index) => (
            <DraggableChip
              key={index}
              id={`sort-item-${index}`}
              label={item}
              isAr={isAr}
              disabled={disabled}
              dimmed={placedIndexes.has(index)}
            />
          ))}
        </div>

        {/* Group drop zones */}
        <div className="space-y-3">
          {groups.map((group, groupIndex) => {
            const placed = Object.entries(selections)
              .filter(([, gIdx]) => gIdx === groupIndex)
              .map(([iIdx]) => ({
                index: Number(iIdx),
                label: items[Number(iIdx)],
              }));

            return (
              <GroupDropZone
                key={groupIndex}
                id={`group-${groupIndex}`}
                label={group}
                placedItems={placed}
                isAr={isAr}
                onRemoveItem={removeItem}
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
