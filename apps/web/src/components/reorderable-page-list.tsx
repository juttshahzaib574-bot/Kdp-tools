"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";

export interface ReorderableItem {
  key: string;
  label: string;
  /** Omit to render the row without a checkbox (used for the "where should this go" preview in the create-page popup). */
  enabled?: boolean;
  /** Small muted note under the label — e.g. "skips automatically if left blank". */
  hint?: string;
  /** Only custom pages are deletable — the four built-ins can only be turned off, never removed. */
  removable?: boolean;
}

export interface ReorderablePageListProps {
  items: ReorderableItem[];
  onReorder: (newOrderKeys: string[]) => void;
  onToggle?: (key: string) => void;
  onDelete?: (key: string) => void;
  /** Renders this row distinctly (accent border) — used to point out the new page being positioned. */
  highlightKey?: string;
}

/**
 * A drag-and-drop-reorderable list of pages, front matter or back matter —
 * shared between the "Create and arrange" tab and the create-page popup's
 * "where should this go" picker, so there's exactly one reordering
 * implementation to get right.
 *
 * Built on dnd-kit rather than hand-rolled pointer events: an earlier
 * version did this by hand and it glitched on real touch devices (rows
 * getting visually stuck mid-drag) in exactly the ways dnd-kit's own
 * sensors are specifically designed to avoid — a short press-and-hold
 * delay on touch so an ordinary scroll swipe doesn't get mistaken for a
 * drag, and a small movement threshold on mouse so a click doesn't. The
 * grabbed row detaches into a floating card (dnd-kit's DragOverlay) that
 * follows the pointer while the rest of the list slides to make room; the
 * up/down arrows are the reliable, always-available fallback that does the
 * same reorder with a tap, no gesture required.
 */
export function ReorderablePageList({
  items,
  onReorder,
  onToggle,
  onDelete,
  highlightKey,
}: ReorderablePageListProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function moveBy(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    onReorder(arrayMove(items, index, target).map((item) => item.key));
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveKey(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveKey(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = items.findIndex((item) => item.key === active.id);
    const toIndex = items.findIndex((item) => item.key === over.id);
    if (fromIndex === -1 || toIndex === -1) return;
    onReorder(arrayMove(items, fromIndex, toIndex).map((item) => item.key));
  }

  function handleDelete(item: ReorderableItem) {
    if (!onDelete) return;
    if (window.confirm(`Delete "${item.label}"? This can't be undone.`)) onDelete(item.key);
  }

  const activeItem = activeKey ? items.find((item) => item.key === activeKey) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveKey(null)}
    >
      <SortableContext items={items.map((item) => item.key)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-1.5">
          {items.map((item, index) => (
            <SortableRow
              key={item.key}
              item={item}
              index={index}
              total={items.length}
              highlighted={highlightKey === item.key}
              onToggle={onToggle}
              onDelete={onDelete && item.removable ? () => handleDelete(item) : undefined}
              onMoveUp={() => moveBy(index, -1)}
              onMoveDown={() => moveBy(index, 1)}
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeItem ? <RowContent item={activeItem} floating /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function RowContent({ item, floating = false }: { item: ReorderableItem; floating?: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md border p-2 ${
        floating
          ? "scale-[1.03] border-accent bg-surface shadow-2xl shadow-black/30"
          : "border-border"
      }`}
    >
      <span className="px-1 py-1 text-muted-foreground">⠿</span>
      {item.enabled !== undefined ? (
        <input
          type="checkbox"
          checked={item.enabled}
          readOnly
          className="h-4 w-4 shrink-0 rounded border-border"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{item.label}</p>
        {item.hint ? <p className="truncate text-[11px] text-muted-foreground">{item.hint}</p> : null}
      </div>
    </div>
  );
}

function SortableRow({
  item,
  index,
  total,
  highlighted,
  onToggle,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  item: ReorderableItem;
  index: number;
  total: number;
  highlighted: boolean;
  onToggle?: (key: string) => void;
  onDelete?: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.key,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-md border p-2 ${
        isDragging
          ? "border-dashed border-accent/40 bg-accent/5 opacity-40"
          : highlighted
            ? "border-accent bg-accent/5"
            : "border-border"
      }`}
    >
      <button
        type="button"
        aria-label={`Drag to reorder ${item.label}`}
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none select-none px-1 py-1 text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing"
      >
        ⠿
      </button>
      {onToggle && item.enabled !== undefined ? (
        <input
          type="checkbox"
          checked={item.enabled}
          onChange={() => onToggle(item.key)}
          className="h-4 w-4 shrink-0 rounded border-border"
          aria-label={`Include ${item.label}`}
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{item.label}</p>
        {item.hint ? <p className="truncate text-[11px] text-muted-foreground">{item.hint}</p> : null}
      </div>
      {onDelete ? (
        <button
          type="button"
          aria-label={`Delete ${item.label}`}
          onClick={onDelete}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm text-muted-foreground hover:bg-danger/10 hover:text-danger"
        >
          ×
        </button>
      ) : null}
      <div className="flex shrink-0 flex-col gap-0.5">
        <button
          type="button"
          aria-label={`Move ${item.label} up`}
          disabled={index === 0}
          onClick={onMoveUp}
          className="flex h-5 w-6 items-center justify-center rounded text-xs text-muted-foreground hover:bg-muted disabled:opacity-30"
        >
          ▲
        </button>
        <button
          type="button"
          aria-label={`Move ${item.label} down`}
          disabled={index === total - 1}
          onClick={onMoveDown}
          className="flex h-5 w-6 items-center justify-center rounded text-xs text-muted-foreground hover:bg-muted disabled:opacity-30"
        >
          ▼
        </button>
      </div>
    </div>
  );
}
