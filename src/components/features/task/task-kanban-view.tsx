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
import { Plus, MoreHorizontal, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { TASK_PRIORITY_OPTIONS } from '@/types/task';
import type { TaskListItem, TaskColumn } from '@/types/task';
import { useTaskDetail } from '@/hooks/use-tasks';
import { cn } from '@/lib/utils';

// ============================================
// Props
// ============================================

interface TaskKanbanViewProps {
  tasks: TaskListItem[];
  columns: TaskColumn[];
  onColumnChange: (taskId: number, columnId: number) => void;
  onReorder: (items: { id: number; columnId: number; sortOrder: number }[]) => void;
  onTaskClick: (taskId: number) => void;
  onChecklistToggle?: (taskId: number, checklistIndex: number, checked: boolean) => void;
  onAddColumn: () => void;
  onEditColumn: (columnId: number) => void;
  onDeleteColumn: (columnId: number) => void;
  onReorderColumns: (items: { id: number; sortOrder: number }[]) => void;
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

function columnDndId(columnId: number): string {
  return `column-${columnId}`;
}

function isColumnDndId(id: string): boolean {
  return id.startsWith('column-');
}

function dndIdToColumnId(id: string): number {
  return parseInt(id.replace('column-', ''), 10);
}

function itemIdToTaskId(itemId: string): number {
  return parseInt(itemId.replace('task-', ''), 10);
}

// ============================================
// サブタスク行
// ============================================

function SubtaskRow({
  child,
  isLast,
  onTaskClick,
}: {
  child: TaskListItem;
  isLast: boolean;
  onTaskClick?: (id: number) => void;
}) {
  return (
    <div
      className="flex items-center gap-1.5 text-xs leading-tight cursor-pointer hover:bg-accent/50 rounded px-1 py-0.5"
      onClick={(e) => { e.stopPropagation(); onTaskClick?.(child.id); }}
    >
      <span className="text-muted-foreground/50 text-[10px] flex-shrink-0">{isLast ? '┗' : '┣'}</span>
      <span className="flex-shrink-0 text-[11px]">
        {child.status === 'done' ? '✅' : child.status === 'in_progress' ? '🔄' : '⬜'}
      </span>
      <span className="truncate text-muted-foreground">{child.title}</span>
    </div>
  );
}

// ============================================
// サブタスクリスト（遅延ロード）
// ============================================

function SubtaskList({ taskId, onTaskClick }: { taskId: number; onTaskClick?: (id: number) => void }) {
  const { data: detail } = useTaskDetail(taskId);
  const children = detail?.children ?? [];

  if (children.length === 0) return null;

  return (
    <div className="space-y-0">
      {children.map((child, i) => (
        <SubtaskRow key={child.id} child={child} isLast={i === children.length - 1} onTaskClick={onTaskClick} />
      ))}
    </div>
  );
}

// ============================================
// チェックリスト（直接チェック可能）
// ============================================

function ChecklistItems({
  taskId,
  onToggle,
}: {
  taskId: number;
  onToggle?: (taskId: number, index: number, checked: boolean) => void;
}) {
  const { data: detail } = useTaskDetail(taskId);
  const checklist = detail?.checklist ?? [];

  if (checklist.length === 0) return null;

  return (
    <div className="space-y-0">
      {checklist.map((item: { id: string; text: string; checked: boolean }, index: number) => (
        <label
          key={item.id}
          className="flex items-center gap-1.5 text-xs leading-tight cursor-pointer hover:bg-accent/50 rounded px-1 py-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={item.checked}
            onChange={() => onToggle?.(taskId, index, !item.checked)}
            className="h-3 w-3 rounded border-muted-foreground/40 flex-shrink-0"
          />
          <span className={cn('truncate', item.checked && 'line-through text-muted-foreground/60')}>
            {item.text}
          </span>
        </label>
      ))}
    </div>
  );
}

// ============================================
// タスクカード（ドラッグ可能）
// ============================================

interface SortableTaskCardProps {
  item: ColumnItem;
  onTaskClick: (id: number) => void;
  onChecklistToggle?: (taskId: number, checklistIndex: number, checked: boolean) => void;
  isDragging?: boolean;
}

function SortableTaskCard({ item, onTaskClick, onChecklistToggle, isDragging }: SortableTaskCardProps) {
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
      <TaskCardContent task={task} onTaskClick={onTaskClick} onChecklistToggle={onChecklistToggle} />
    </div>
  );
}

// ============================================
// カードコンテンツ（オーバーレイ共用）
// ============================================

function TaskCardContent({
  task,
  onTaskClick,
  onChecklistToggle,
}: {
  task: TaskListItem;
  onTaskClick?: (id: number) => void;
  onChecklistToggle?: (taskId: number, checklistIndex: number, checked: boolean) => void;
}) {
  const [subtasksOpen, setSubtasksOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const priorityDef = TASK_PRIORITY_OPTIONS.find((p) => p.value === task.priority);
  const dueDateStr = formatDueDate(task.dueDate);
  const overdue = isOverdue(task.dueDate);

  return (
    <div className="space-y-1.5">
      {/* タイトル */}
      <p className="text-sm font-medium leading-snug line-clamp-2">{task.title}</p>

      {/* 担当者・期日・優先度 */}
      <div className="flex items-center gap-2 flex-wrap">
        {task.assigneeName && (
          <span className="text-xs text-muted-foreground truncate max-w-[80px]">
            {task.assigneeName}
          </span>
        )}
        {dueDateStr && (
          <span
            className={cn(
              'text-xs font-medium',
              overdue ? 'text-red-600' : 'text-muted-foreground',
            )}
          >
            期限：{dueDateStr}
          </span>
        )}
        {priorityDef && (
          <span
            className="flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: `${priorityDef.color}20`, color: priorityDef.color }}
          >
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: priorityDef.color }}
            />
            優先度：{priorityDef.label}
          </span>
        )}
      </div>

      {/* チェックリスト（折りたたみ式・直接チェック可能） */}
      {task.checklistTotal > 0 && (
        <div className="border-t pt-1 mt-1">
          <button
            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground w-full"
            onClick={(e) => { e.stopPropagation(); setChecklistOpen(!checklistOpen); }}
          >
            <span className="text-[10px]">{checklistOpen ? '▼' : '▶'}</span>
            <span>チェックリスト ({task.checklistDoneCount}/{task.checklistTotal})</span>
          </button>
          {checklistOpen && (
            <div className="mt-1 ml-2">
              <ChecklistItems taskId={task.id} onToggle={onChecklistToggle} />
            </div>
          )}
        </div>
      )}

      {/* サブタスク（折りたたみ式） */}
      {task.childrenCount > 0 && (
        <div className={cn(task.checklistTotal === 0 && 'border-t pt-1 mt-1')}>
          <button
            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground w-full"
            onClick={(e) => { e.stopPropagation(); setSubtasksOpen(!subtasksOpen); }}
          >
            <span className="text-[10px]">{subtasksOpen ? '▼' : '▶'}</span>
            <span>サブタスク ({task.childrenCount})</span>
          </button>
          {subtasksOpen && (
            <div className="mt-1 ml-2 space-y-0.5">
              <SubtaskList taskId={task.id} onTaskClick={onTaskClick} />
            </div>
          )}
        </div>
      )}

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
// カラムヘッダーメニュー
// ============================================

function ColumnMenu({
  columnId,
  onEdit,
  onDelete,
  onMoveLeft,
  onMoveRight,
  isFirst,
  isLast,
}: {
  columnId: number;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="rounded p-1 hover:bg-black/10 transition-colors"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-md border bg-popover shadow-md">
            {!isFirst && (
              <button
                onClick={() => { setIsOpen(false); onMoveLeft(); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                左に移動
              </button>
            )}
            {!isLast && (
              <button
                onClick={() => { setIsOpen(false); onMoveRight(); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
              >
                <ChevronRight className="h-3.5 w-3.5" />
                右に移動
              </button>
            )}
            <button
              onClick={() => {
                setIsOpen(false);
                onEdit(columnId);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
            >
              <Pencil className="h-3.5 w-3.5" />
              列名を編集
            </button>
            <button
              onClick={() => {
                setIsOpen(false);
                onDelete(columnId);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-accent"
            >
              <Trash2 className="h-3.5 w-3.5" />
              列を削除
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================
// カラム（ドロップ可能エリア）
// ============================================

interface KanbanColumnProps {
  column: TaskColumn;
  items: ColumnItem[];
  onTaskClick: (id: number) => void;
  onChecklistToggle?: (taskId: number, checklistIndex: number, checked: boolean) => void;
  activeId: string | null;
  onEditColumn: (id: number) => void;
  onDeleteColumn: (id: number) => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  isFirst: boolean;
  isLast: boolean;
}

function KanbanColumn({
  column,
  items,
  onTaskClick,
  onChecklistToggle,
  activeId,
  onEditColumn,
  onDeleteColumn,
  onMoveLeft,
  onMoveRight,
  isFirst,
  isLast,
}: KanbanColumnProps) {
  const dndId = columnDndId(column.id);
  const { setNodeRef, isOver } = useDroppable({ id: dndId });
  const color = column.color ?? '#6b7280';

  return (
    <div className="flex flex-col min-w-[260px] max-w-[300px] flex-1">
      {/* カラムヘッダー */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-t-lg border-t border-x font-semibold text-sm"
        style={{ borderTopColor: color, backgroundColor: `${color}10` }}
      >
        <span
          className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="flex-1 truncate" style={{ color }}>
          {column.name}
        </span>
        <span
          className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white"
          style={{ backgroundColor: color }}
        >
          {items.length}
        </span>
        <ColumnMenu
          columnId={column.id}
          onEdit={onEditColumn}
          onDelete={onDeleteColumn}
          onMoveLeft={onMoveLeft}
          onMoveRight={onMoveRight}
          isFirst={isFirst}
          isLast={isLast}
        />
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
              onChecklistToggle={onChecklistToggle}
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
  columns,
  onColumnChange,
  onReorder,
  onTaskClick,
  onChecklistToggle,
  onAddColumn,
  onEditColumn,
  onDeleteColumn,
  onReorderColumns,
}: TaskKanbanViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // sortOrder順にソートした列
  const sortedColumns = [...columns].sort((a, b) => a.sortOrder - b.sortOrder);

  // columnId別にタスクをグループ化
  const [columnItems, setColumnItems] = useState<Record<number, ColumnItem[]>>(() =>
    buildColumnItems(tasks, sortedColumns),
  );

  // propsのtasks/columnsが変わったらカラムを再構築
  const [prevTasks, setPrevTasks] = useState(tasks);
  const [prevColumns, setPrevColumns] = useState(columns);
  if (tasks !== prevTasks || columns !== prevColumns) {
    setPrevTasks(tasks);
    setPrevColumns(columns);
    setColumnItems(buildColumnItems(tasks, sortedColumns));
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
    const sourceColId = findColumnIdForItem(columnItems, activeItemId);
    if (sourceColId === undefined) return;

    // オーバー先: カラムDnD IDか、別カラムのアイテムIDか判定
    const targetColId = isColumnDndId(overId)
      ? dndIdToColumnId(overId)
      : findColumnIdForItem(columnItems, overId);

    if (targetColId === undefined) return;

    // 同一カラム内の並び替え（リアルタイムフィードバック）
    if (sourceColId === targetColId && !isColumnDndId(overId)) {
      setColumnItems((prev) => {
        const items = [...(prev[sourceColId] ?? [])];
        const oldIndex = items.findIndex((i) => i.id === activeItemId);
        const newIndex = items.findIndex((i) => i.id === overId);
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return prev;
        return { ...prev, [sourceColId]: arrayMove(items, oldIndex, newIndex) };
      });
      return;
    }

    if (sourceColId === targetColId) return;

    // カラムをまたいだ移動
    setColumnItems((prev) => {
      const sourceItems = [...(prev[sourceColId] ?? [])];
      const targetItems = [...(prev[targetColId] ?? [])];

      const sourceIndex = sourceItems.findIndex((i) => i.id === activeItemId);
      if (sourceIndex === -1) return prev;

      const [moved] = sourceItems.splice(sourceIndex, 1);

      if (!isColumnDndId(overId)) {
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
        [sourceColId]: sourceItems,
        [targetColId]: targetItems,
      };
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeItemId = active.id as string;
    const overId = over.id as string;

    const currentColId = findColumnIdForItem(columnItems, activeItemId);
    if (currentColId === undefined) return;

    const targetColId = isColumnDndId(overId)
      ? dndIdToColumnId(overId)
      : findColumnIdForItem(columnItems, overId);

    if (targetColId === undefined) return;

    if (currentColId !== targetColId) {
      // カラム間移動
      const allReorderItems = buildReorderPayload(columnItems);
      onReorder(allReorderItems);
    } else {
      // 同一カラム内の並び替え
      const items = columnItems[currentColId] ?? [];
      const oldIndex = items.findIndex((i) => i.id === activeItemId);
      const newIndex = items.findIndex((i) => i.id === overId);

      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const reordered = arrayMove(items, oldIndex, newIndex);
        const updated = { ...columnItems, [currentColId]: reordered };
        setColumnItems(updated);
        const allReorderItems = buildReorderPayload(updated);
        onReorder(allReorderItems);
      } else {
        // 同一位置にドロップ or 移動なし — それでもカラム間移動の結果を保存
        const allReorderItems = buildReorderPayload(columnItems);
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
        {sortedColumns.map((col, idx) => (
          <KanbanColumn
            key={col.id}
            column={col}
            items={columnItems[col.id] ?? []}
            onTaskClick={onTaskClick}
            onChecklistToggle={onChecklistToggle}
            activeId={activeId}
            onEditColumn={onEditColumn}
            onDeleteColumn={onDeleteColumn}
            isFirst={idx === 0}
            isLast={idx === sortedColumns.length - 1}
            onMoveLeft={() => {
              if (idx === 0) return;
              const reordered = [...sortedColumns];
              [reordered[idx - 1], reordered[idx]] = [reordered[idx], reordered[idx - 1]];
              onReorderColumns(reordered.map((c, i) => ({ id: c.id, sortOrder: i })));
            }}
            onMoveRight={() => {
              if (idx === sortedColumns.length - 1) return;
              const reordered = [...sortedColumns];
              [reordered[idx], reordered[idx + 1]] = [reordered[idx + 1], reordered[idx]];
              onReorderColumns(reordered.map((c, i) => ({ id: c.id, sortOrder: i })));
            }}
          />
        ))}

        {/* 列追加ボタン */}
        <div className="min-w-[260px] max-w-[300px] flex-1">
          <button
            onClick={onAddColumn}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 py-8 text-sm text-muted-foreground hover:text-foreground hover:border-muted-foreground/60 transition-colors"
          >
            <Plus className="h-4 w-4" />
            列を追加
          </button>
        </div>
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

function buildColumnItems(
  tasks: TaskListItem[],
  columns: TaskColumn[],
): Record<number, ColumnItem[]> {
  const result: Record<number, ColumnItem[]> = {};

  // 全カラムを初期化
  for (const col of columns) {
    result[col.id] = [];
  }

  // タスクを振り分け
  for (const task of tasks) {
    const colId = task.columnId;

    if (colId != null && result[colId] !== undefined) {
      result[colId].push({ id: `task-${task.id}`, task });
    } else if (columns.length > 0) {
      // columnId未設定のタスクは最初の列に入れる
      result[columns[0].id].push({ id: `task-${task.id}`, task });
    }
  }

  // 各カラム内をsortOrder順にソート
  for (const colId of Object.keys(result)) {
    result[Number(colId)].sort((a, b) => {
      const aOrder = (a.task as TaskListItem & { sortOrder?: number }).sortOrder ?? 0;
      const bOrder = (b.task as TaskListItem & { sortOrder?: number }).sortOrder ?? 0;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return new Date(a.task.createdAt).getTime() - new Date(b.task.createdAt).getTime();
    });
  }

  return result;
}

function findColumnIdForItem(
  columnItems: Record<number, ColumnItem[]>,
  itemId: string,
): number | undefined {
  for (const [colId, items] of Object.entries(columnItems)) {
    if (items.some((i) => i.id === itemId)) return Number(colId);
  }
  return undefined;
}

function findTaskById(
  columnItems: Record<number, ColumnItem[]>,
  itemId: string,
): TaskListItem | null {
  for (const items of Object.values(columnItems)) {
    const found = items.find((i) => i.id === itemId);
    if (found) return found.task;
  }
  return null;
}

function buildReorderPayload(
  columnItems: Record<number, ColumnItem[]>,
): { id: number; columnId: number; sortOrder: number }[] {
  const result: { id: number; columnId: number; sortOrder: number }[] = [];
  for (const [colId, items] of Object.entries(columnItems)) {
    items.forEach((item, index) => {
      result.push({
        id: itemIdToTaskId(item.id),
        columnId: Number(colId),
        sortOrder: index,
      });
    });
  }
  return result;
}
