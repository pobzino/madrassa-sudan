'use client';

import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SequenceItem {
  index: number;
  label: string;
}

interface SequenceOrderDnDProps {
  items: SequenceItem[];
  onOrderChange: (ordered: string[]) => void;
  disabled: boolean;
  isAr: boolean;
}

function SortableItem({
  item,
  position,
  isAr,
  disabled,
}: {
  item: SequenceItem;
  position: number;
  isAr: boolean;
  disabled: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `seq-${item.index}`,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: 'none' as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-3 py-3 ${
        isDragging ? 'opacity-40 shadow-lg scale-[1.02]' : ''
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <span
        {...attributes}
        {...listeners}
        className={`flex-shrink-0 text-gray-400 ${disabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
        style={{ touchAction: 'none' }}
      >
        ⠿
      </span>
      <span className="flex-shrink-0 w-6 text-center text-xs font-bold text-gray-400">
        {position}
      </span>
      <span className={`text-sm font-medium text-gray-800 ${isAr ? 'font-cairo' : 'font-inter'}`}>
        {item.label}
      </span>
    </div>
  );
}

export default function SequenceOrderDnD({
  items: initialItems,
  onOrderChange,
  disabled,
  isAr,
}: SequenceOrderDnDProps) {
  const [orderedItems, setOrderedItems] = useState<SequenceItem[]>(initialItems);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderedItems.findIndex((i) => `seq-${i.index}` === active.id);
    const newIndex = orderedItems.findIndex((i) => `seq-${i.index}` === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(orderedItems, oldIndex, newIndex);
    setOrderedItems(newOrder);
    onOrderChange(newOrder.map((i) => String(i.index)));
  }

  const activeItem = activeId
    ? orderedItems.find((i) => `seq-${i.index}` === activeId)
    : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={orderedItems.map((i) => `seq-${i.index}`)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2">
          {orderedItems.map((item, index) => (
            <SortableItem
              key={`seq-${item.index}`}
              item={item}
              position={index + 1}
              isAr={isAr}
              disabled={disabled}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeItem ? (
          <div className="flex items-center gap-3 rounded-2xl border border-[#007229] bg-white px-3 py-3 shadow-lg">
            <span className="flex-shrink-0 text-gray-400">⠿</span>
            <span className={`text-sm font-medium text-gray-800 ${isAr ? 'font-cairo' : 'font-inter'}`}>
              {activeItem.label}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
