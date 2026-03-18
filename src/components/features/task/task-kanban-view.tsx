'use client';

import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TASK_STATUS_OPTIONS, TASK_PRIORITY_OPTIONS } from '@/types/task';
import type { TaskListItem } from '@/types/task';
import { cn } from '@/lib/utils';

// ============================================
// Props
// ============================================

interface TaskKanbanViewProps {
  tasks: TaskListItem[];
  onTaskClick: (id: number) => void;
  onStatusChange: (taskId: number, newStatus: string) => void;
  onReorder: (items: { id: number; status: string; sortOrder: number }[]) => void;
}

// ============================================
// 型
// ============================================

interface ColumnItem {
  id: string; // `task-${task.id}` 形式
  task: TaskListItem;
}

// ============================================
// ヘルパー
// ============================================

function formatDueDate(dueDate: string | null): string | null {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  if (isNaN(d.getTime())) return null;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const d = new Date(dueDate);
  if (isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

// ============================================
// タスクカード（ドラッグ可能）
// ============================================

interface SortableTaskCardProps {
  item: ColumnItem;
  onTaskClick: (id: number) => void;
  isDragging?: boolean;
}

function SortableTaskCard({ item, onTaskClick, isDragging }: SortableTaskCardProps) {
  const { task } = item;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'rounded-lg border bg-background shadow-sm p-3 cursor-grab active:cursor-grabbing select-none',
        (isSortableDragging || isDragging) && 'opacity-40',
      )}
      onClick={() => onTaskClick(task.id)}
    >
      <TaskCardContent task={task} />
    </div>
  );
}

// ============================================
// カードコンテンツ（オーバーレイ共用）
// ============================================

function TaskCardContent({ task }: { task: TaskListItem }) {
  const priorityDef = TASK_PRIORITY_OPTIONS.find((p) => p.value === task.priority);
  const dueDateStr = formatDueDate(task.dueDate);
  const overdue = isOverdue(task.dueDate);

  return (
    <div className="space-y-1.5">
      {/* タイトル */}
      <p className="text-sm font-medium leading-snug line-clamp-2">{task.title}</p>

      {/* 担当者・期日 */}
      {(task.assigneeName || dueDateStr) && (
        <div className="flex items-center gap-2 flex-wrap">
          {task.assigneeName && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <span>👤</span>
              <span className="truncate max-w-[80px]">{task.assigneeName}</span>
            </span>
          )}
          {dueDateStr && (
            <span
              className={cn(
                'flex items-center gap-1 text-xs font-medium',
                overdue ? 'text-red-600' : 'text-muted-foreground',
              )}
            >
              <span>📅</span>
              <span>{dueDateStr}</span>
            </span>
          )}
        </div>
      )}

      {/* 優先度・サブタスク進捗 */}
      <div className="flex items-center gap-2 flex-wrap">
        {priorityDef && (
          <span
            className="flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full"
            style={{
              backgroundColor: `${priorityDef.color}20`,
              color: priorityDef.color,
            }}
          >
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: priorityDef.color }}
            />
            {priorityDef.label}
          </span>
        )}
        {task.childrenCount > 0 && (
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            子 {task.childrenDoneCount}/{task.childrenCount}
          </span>
        )}
      </div>

      {/* タグ */}
      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {task.tags.map((tag) => (
            <span
              key={tag.id}
              className="text-xs px-1.5 py-0.5 rounded-full font-medium"
              style={{
                backgroundColor: `${tag.color}20`,
                color: tag.color,
                border: `1px solid ${tag.color}40`,
              }}
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// カラム（ドロップ可能エリア）
// ============================================

interface KanbanColumnProps {
  statusValue: string;
  statusLabel: string;
  statusColor: string;
  items: ColumnItem[];
  onTaskClick: (id: number) => void;
  activeId: string | null;
}

function KanbanColumn({
  statusValue,
  statusLabel,
  statusColor,
  items,
  onTaskClick,
  activeId,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: statusValue });

  return (
    <div className="flex flex-col min-w-[260px] max-w-[300px] flex-1">
      {/* カラムヘッダー */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-t-lg border-t border-x font-semibold text-sm"
        style={{ borderTopColor: statusColor, backgroundColor: `${statusColor}10` }}
      >
        <span
          className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: statusColor }}
        />
        <span className="flex-1 truncate" style={{ color: statusColor }}>
          {statusLabel}
        </span>
        <span
          className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white"
          style={{ backgroundColor: statusColor }}
        >
          {items.length}
        </span>
      </div>

      {/* カード一覧 */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 border border-t-0 rounded-b-lg p-2 space-y-2 overflow-y-auto min-h-[120px] transition-colors',
          isOver ? 'bg-accent/60' : 'bg-muted/20',
        )}
      >
        <SortableContext
          items={items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {items.map((item) => (
            <SortableTaskCard
              key={item.id}
              item={item}
              onTaskClick={onTaskClick}
              isDragging={activeId === item.id}
            />
          ))}
        </SortableContext>
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">タスクなし</p>
        )}
      </div>
    </div>
  );
}

// ============================================
// メインコンポーネント
// ============================================

export function TaskKanbanView({
  tasks,
  onTaskClick,
  onStatusChange,
  onReorder,
}: TaskKanbanViewProps) {
  // activeId は "task-{id}" 形式
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // ステータス別にグループ化してsortOrder順に並べる
  const [columnItems, setColumnItems] = useState<Record<string, ColumnItem[]>>(() =>
    buildColumnItems(tasks),
  );

  // propsのtasksが変わったらカラムを再構築
  // （外部からのデータ更新を反映）
  // NOTE: 親コンポーネントでの楽観的更新と競合しないよう、
  // ドラッグ操作中は更新しない実装でも十分だが、ここでは
  // シンプルにprops変化時に同期する
  const [prevTasks, setPrevTasks] = useState(tasks);
  if (tasks !== prevTasks) {
    setPrevTasks(tasks);
    setColumnItems(buildColumnItems(tasks));
  }

  const activeTask = activeId ? findTaskById(columnItems, activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeItemId = active.id as string;
    const overId = over.id as string;

    // ドラッグ元カラムを特定
    const sourceStatus = findStatusForItem(columnItems, activeItemId);
    if (!sourceStatus) return;

    // オーバー先: カラムIDか、別カラムのアイテムIDか判定
    const targetStatus = isColumnId(overId)
      ? overId
      : findStatusForItem(columnItems, overId);

    if (!targetStatus || sourceStatus === targetStatus) return;

    // カラムをまたいだ移動: アイテムを移動
    setColumnItems((prev) => {
      const sourceItems = [...(prev[sourceStatus] ?? [])];
      const targetItems = [...(prev[targetStatus] ?? [])];

      const sourceIndex = sourceItems.findIndex((i) => i.id === activeItemId);
      if (sourceIndex === -1) return prev;

      const [moved] = sourceItems.splice(sourceIndex, 1);

      // オーバー先がアイテムIDなら、そのアイテムの前に挿入
      if (!isColumnId(overId)) {
        const overIndex = targetItems.findIndex((i) => i.id === overId);
        if (overIndex !== -1) {
          targetItems.splice(overIndex, 0, moved);
        } else {
          targetItems.push(moved);
        }
      } else {
        targetItems.push(moved);
      }

      return {
        ...prev,
        [sourceStatus]: sourceItems,
        [targetStatus]: targetItems,
      };
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeItemId = active.id as string;
    const overId = over.id as string;

    const currentStatus = findStatusForItem(columnItems, activeItemId);
    if (!currentStatus) return;

    const targetStatus = isColumnId(overId)
      ? overId
      : findStatusForItem(columnItems, overId);

    if (!targetStatus) return;

    if (currentStatus !== targetStatus) {
      // ステータス変更を親に通知
      const taskId = itemIdToTaskId(activeItemId);
      onStatusChange(taskId, targetStatus);

      // 並び順変更を通知
      const allReorderItems = buildReorderPayload(columnItems);
      onReorder(allReorderItems);
    } else {
      // 同一カラム内の並び替え
      const items = columnItems[currentStatus] ?? [];
      const oldIndex = items.findIndex((i) => i.id === activeItemId);
      const newIndex = items.findIndex((i) => i.id === overId);

      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const reordered = arrayMove(items, oldIndex, newIndex);
        setColumnItems((prev) => ({ ...prev, [currentStatus]: reordered }));
        const allReorderItems = buildReorderPayload({ ...columnItems, [currentStatus]: reordered });
        onReorder(allReorderItems);
      }
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[400px]">
        {TASK_STATUS_OPTIONS.map((statusDef) => (
          <KanbanColumn
            key={statusDef.value}
            statusValue={statusDef.value}
            statusLabel={statusDef.label}
            statusColor={statusDef.color}
            items={columnItems[statusDef.value] ?? []}
            onTaskClick={onTaskClick}
            activeId={activeId}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask && (
          <div className="rounded-lg border bg-background shadow-xl p-3 w-[260px] rotate-1 opacity-95">
            <TaskCardContent task={activeTask} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// ============================================
// ユーティリティ関数
// ============================================

function buildColumnItems(tasks: TaskListItem[]): Record<string, ColumnItem[]> {
  const result: Record<string, ColumnItem[]> = {};
  for (const statusDef of TASK_STATUS_OPTIONS) {
    result[statusDef.value] = tasks
      .filter((t) => t.status === statusDef.value)
      .sort((a, b) => {
        // sortOrderはTaskDetailにのみ存在するため、
        // TaskListItemにはないので createdAt でフォールバック
        const aOrder = (a as TaskListItem & { sortOrder?: number }).sortOrder ?? 0;
        const bOrder = (b as TaskListItem & { sortOrder?: number }).sortOrder ?? 0;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      })
      .map((t) => ({ id: `task-${t.id}`, task: t }));
  }
  return result;
}

function findStatusForItem(
  columnItems: Record<string, ColumnItem[]>,
  itemId: string,
): string | undefined {
  for (const [status, items] of Object.entries(columnItems)) {
    if (items.some((i) => i.id === itemId)) return status;
  }
  return undefined;
}

function findTaskById(
  columnItems: Record<string, ColumnItem[]>,
  itemId: string,
): TaskListItem | null {
  for (const items of Object.values(columnItems)) {
    const found = items.find((i) => i.id === itemId);
    if (found) return found.task;
  }
  return null;
}

function isColumnId(id: string): boolean {
  return TASK_STATUS_OPTIONS.some((s) => s.value === id);
}

function itemIdToTaskId(itemId: string): number {
  return parseInt(itemId.replace('task-', ''), 10);
}

function buildReorderPayload(
  columnItems: Record<string, ColumnItem[]>,
): { id: number; status: string; sortOrder: number }[] {
  const result: { id: number; status: string; sortOrder: number }[] = [];
  for (const [status, items] of Object.entries(columnItems)) {
    items.forEach((item, index) => {
      result.push({ id: itemIdToTaskId(item.id), status, sortOrder: index });
    });
  }
  return result;
}
