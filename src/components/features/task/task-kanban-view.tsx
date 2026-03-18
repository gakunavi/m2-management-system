'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, MoreHorizontal, Pencil, Trash2, GripVertical, ChevronRight, ChevronDown } from 'lucide-react';
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
// ID ヘルパー（列 vs カード識別）
// ============================================

const COLUMN_PREFIX = 'column-';
const TASK_PREFIX = 'task-';

function columnDndId(id: number): string { return `${COLUMN_PREFIX}${id}`; }
function taskDndId(id: number): string { return `${TASK_PREFIX}${id}`; }
function isColumnId(id: string): boolean { return id.startsWith(COLUMN_PREFIX); }
function isTaskId(id: string): boolean { return id.startsWith(TASK_PREFIX); }
function parseColumnId(id: string): number { return parseInt(id.replace(COLUMN_PREFIX, ''), 10); }
function parseTaskId(id: string): number { return parseInt(id.replace(TASK_PREFIX, ''), 10); }

// ============================================
// 表示ヘルパー
// ============================================

function formatDueDate(dueDate: string | null): string | null {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  if (isNaN(d.getTime())) return null;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status === 'done') return false;
  const d = new Date(dueDate);
  if (isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

// ============================================
// ColumnItems 型とビルダー
// ============================================

interface ColumnItem {
  id: string; // task-{taskId}
  task: TaskListItem;
}

function buildColumnItems(
  tasks: TaskListItem[],
  columns: TaskColumn[],
): Record<number, ColumnItem[]> {
  const result: Record<number, ColumnItem[]> = {};
  for (const col of columns) {
    result[col.id] = [];
  }
  for (const task of tasks) {
    const colId = task.columnId;
    if (colId != null && result[colId] !== undefined) {
      result[colId].push({ id: taskDndId(task.id), task });
    } else if (columns.length > 0) {
      result[columns[0].id].push({ id: taskDndId(task.id), task });
    }
  }
  for (const colId of Object.keys(result)) {
    result[Number(colId)].sort((a, b) => {
      const aOrder = a.task.sortOrder ?? 0;
      const bOrder = b.task.sortOrder ?? 0;
      return aOrder !== bOrder ? aOrder - bOrder : new Date(a.task.createdAt).getTime() - new Date(b.task.createdAt).getTime();
    });
  }
  return result;
}

function findColumnForItem(items: Record<number, ColumnItem[]>, itemId: string): number | undefined {
  for (const [colId, colItems] of Object.entries(items)) {
    if (colItems.some((i) => i.id === itemId)) return Number(colId);
  }
  return undefined;
}

function findTaskInItems(items: Record<number, ColumnItem[]>, itemId: string): TaskListItem | null {
  for (const colItems of Object.values(items)) {
    const found = colItems.find((i) => i.id === itemId);
    if (found) return found.task;
  }
  return null;
}

function buildReorderPayload(items: Record<number, ColumnItem[]>): { id: number; columnId: number; sortOrder: number }[] {
  const result: { id: number; columnId: number; sortOrder: number }[] = [];
  for (const [colId, colItems] of Object.entries(items)) {
    colItems.forEach((item, index) => {
      result.push({ id: parseTaskId(item.id), columnId: Number(colId), sortOrder: index });
    });
  }
  return result;
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
        <div
          key={child.id}
          className="flex items-center gap-1.5 text-xs leading-tight cursor-pointer hover:bg-accent/50 rounded px-1 py-0.5"
          onClick={(e) => { e.stopPropagation(); onTaskClick?.(child.id); }}
        >
          <span className="text-muted-foreground/50 text-[10px] flex-shrink-0">
            {i === children.length - 1 ? '┗' : '┣'}
          </span>
          <span className="flex-shrink-0 text-[11px]">
            {child.status === 'done' ? '✅' : child.status === 'in_progress' ? '🔄' : '⬜'}
          </span>
          <span className="truncate text-muted-foreground">{child.title}</span>
        </div>
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
// カードコンテンツ（カード本体＋DragOverlay共用）
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
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [subtasksOpen, setSubtasksOpen] = useState(false);
  const priorityDef = TASK_PRIORITY_OPTIONS.find((p) => p.value === task.priority);
  const dueDateStr = formatDueDate(task.dueDate);
  const overdue = isOverdue(task.dueDate, task.status);

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium leading-snug line-clamp-2">{task.title}</p>

      <div className="flex items-center gap-2 flex-wrap">
        {task.assigneeName && (
          <span className="text-xs text-muted-foreground truncate max-w-[80px]">{task.assigneeName}</span>
        )}
        {dueDateStr && (
          <span className={cn('text-xs font-medium', overdue ? 'text-red-600' : 'text-muted-foreground')}>
            期限：{dueDateStr}
          </span>
        )}
        {priorityDef && (
          <span
            className="flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: `${priorityDef.color}20`, color: priorityDef.color }}
          >
            <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: priorityDef.color }} />
            優先度：{priorityDef.label}
          </span>
        )}
      </div>

      {/* チェックリスト（折りたたみ式） */}
      {task.checklistTotal > 0 && (
        <div className="border-t pt-1 mt-1">
          <button
            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground w-full text-left"
            onClick={(e) => { e.stopPropagation(); setChecklistOpen(!checklistOpen); }}
          >
            {checklistOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
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
            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground w-full text-left"
            onClick={(e) => { e.stopPropagation(); setSubtasksOpen(!subtasksOpen); }}
          >
            {subtasksOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
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
              style={{ backgroundColor: `${tag.color}20`, color: tag.color, border: `1px solid ${tag.color}40` }}
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
// ソータブルタスクカード
// ============================================

function SortableTaskCard({
  item,
  columnId,
  onTaskClick,
  onChecklistToggle,
}: {
  item: ColumnItem;
  columnId: number;
  onTaskClick: (id: number) => void;
  onChecklistToggle?: (taskId: number, checklistIndex: number, checked: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { type: 'task', task: item.task, columnId },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'rounded-lg border bg-background shadow-sm p-3 cursor-grab active:cursor-grabbing select-none',
        isDragging && 'opacity-40',
      )}
      onClick={() => onTaskClick(item.task.id)}
    >
      <TaskCardContent task={item.task} onTaskClick={onTaskClick} onChecklistToggle={onChecklistToggle} />
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
}: {
  columnId: number;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
        className="rounded p-1 hover:bg-black/10 transition-colors"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded-md border bg-popover shadow-md">
            <button
              onClick={() => { setIsOpen(false); onEdit(columnId); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
            >
              <Pencil className="h-3.5 w-3.5" />
              列名を編集
            </button>
            <button
              onClick={() => { setIsOpen(false); onDelete(columnId); }}
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
// ソータブルカラム（列自体がドラッグ可能）
// ============================================

function SortableColumn({
  column,
  items,
  onTaskClick,
  onChecklistToggle,
  onEditColumn,
  onDeleteColumn,
}: {
  column: TaskColumn;
  items: ColumnItem[];
  onTaskClick: (id: number) => void;
  onChecklistToggle?: (taskId: number, checklistIndex: number, checked: boolean) => void;
  onEditColumn: (id: number) => void;
  onDeleteColumn: (id: number) => void;
}) {
  const dndId = columnDndId(column.id);
  const color = column.color ?? '#6b7280';

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    over,
  } = useSortable({
    id: dndId,
    data: { type: 'column', column },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  // この列にカードがドラッグされているか
  const isCardOver = over && isTaskId(over.id as string) && !isDragging;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col min-w-[260px] max-w-[300px] flex-1"
    >
      {/* カラムヘッダー（列のドラッグハンドルを含む） */}
      <div
        className="flex items-center gap-1 px-2 py-2 rounded-t-lg border-t border-x font-semibold text-sm"
        style={{ borderTopColor: color, backgroundColor: `${color}10` }}
      >
        <div
          className="cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-black/10"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50" />
        </div>
        <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="flex-1 truncate" style={{ color }}>{column.name}</span>
        <span
          className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white"
          style={{ backgroundColor: color }}
        >
          {items.length}
        </span>
        <ColumnMenu columnId={column.id} onEdit={onEditColumn} onDelete={onDeleteColumn} />
      </div>

      {/* カード一覧（SortableContextで内部のカードをソート可能に） */}
      <div
        className={cn(
          'flex-1 border border-t-0 rounded-b-lg p-2 space-y-2 overflow-y-auto min-h-[120px] transition-colors',
          isCardOver ? 'bg-accent/60' : 'bg-muted/20',
        )}
      >
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <SortableTaskCard
              key={item.id}
              item={item}
              columnId={column.id}
              onTaskClick={onTaskClick}
              onChecklistToggle={onChecklistToggle}
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
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // カスタム衝突検知: 列ドラッグ中は列のみ検出、カードドラッグ中は全て検出
  const customCollisionDetection: CollisionDetection = useCallback((args) => {
    const draggingId = args.active.id as string;

    if (isColumnId(draggingId)) {
      // 列ドラッグ中: 列コンテナのみを対象にclosestCenterで検出
      const columnContainers = args.droppableContainers.filter(
        (container) => isColumnId(container.id as string),
      );
      return closestCenter({ ...args, droppableContainers: columnContainers });
    }

    // カードドラッグ中: 全て対象にclosestCornersで検出
    return closestCorners(args);
  }, []);

  // ローカル列順序（D&D即時反映用）
  const [localColumns, setLocalColumns] = useState<TaskColumn[]>(() =>
    [...columns].sort((a, b) => a.sortOrder - b.sortOrder),
  );

  // カラム別タスク（D&D即時反映用）
  const [columnItems, setColumnItems] = useState<Record<number, ColumnItem[]>>(() =>
    buildColumnItems(tasks, localColumns),
  );

  // props変更時にローカルstateを同期（ref比較で無限ループ防止）
  const prevTasksRef = useRef(tasks);
  const prevColumnsRef = useRef(columns);
  useEffect(() => {
    if (tasks !== prevTasksRef.current || columns !== prevColumnsRef.current) {
      prevTasksRef.current = tasks;
      prevColumnsRef.current = columns;
      const sorted = [...columns].sort((a, b) => a.sortOrder - b.sortOrder);
      setLocalColumns(sorted);
      setColumnItems(buildColumnItems(tasks, sorted));
    }
  }, [tasks, columns]);

  // 最新のcolumnItemsをrefで保持（コールバック内でstale closureを防ぐ）
  const columnItemsRef = useRef(columnItems);
  columnItemsRef.current = columnItems;

  const localColumnsRef = useRef(localColumns);
  localColumnsRef.current = localColumns;

  // アクティブなドラッグ対象
  const activeTask = activeId && isTaskId(activeId) ? findTaskInItems(columnItems, activeId) : null;
  const activeColumn = activeId && isColumnId(activeId) ? localColumns.find(c => columnDndId(c.id) === activeId) : null;

  // 列のDnD ID一覧
  const columnDndIds = localColumns.map(c => columnDndId(c.id));

  // ======== DnDハンドラー ========

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = event.active.id as string;
    console.log('[DnD] dragStart', { id, type: isColumnId(id) ? 'COLUMN' : isTaskId(id) ? 'TASK' : 'UNKNOWN' });
    setActiveId(id);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeItemId = active.id as string;
    const overItemId = over.id as string;

    console.log('[DnD] dragOver', {
      active: activeItemId,
      activeType: isColumnId(activeItemId) ? 'COLUMN' : 'TASK',
      over: overItemId,
      overType: isColumnId(overItemId) ? 'COLUMN' : 'TASK',
    });

    // 列ドラッグ中はカード移動しない
    if (isColumnId(activeItemId)) {
      console.log('[DnD] dragOver: column drag, skipping card logic');
      return;
    }

    // カードドラッグ中のみ処理
    if (!isTaskId(activeItemId)) return;

    const currentItems = columnItemsRef.current;

    // ドラッグ元列を特定
    const sourceColId = findColumnForItem(currentItems, activeItemId);
    if (sourceColId === undefined) {
      console.log('[DnD] dragOver: sourceColId not found for', activeItemId);
      return;
    }

    // ドロップ先列を特定
    let targetColId: number | undefined;
    if (isColumnId(overItemId)) {
      targetColId = parseColumnId(overItemId);
    } else if (isTaskId(overItemId)) {
      targetColId = findColumnForItem(currentItems, overItemId);
    }

    if (targetColId === undefined) {
      console.log('[DnD] dragOver: targetColId not found for', overItemId);
      return;
    }

    console.log('[DnD] dragOver: sourceCol=', sourceColId, 'targetCol=', targetColId);

    // 同一列内の並び替え
    if (sourceColId === targetColId) {
      if (isTaskId(overItemId)) {
        setColumnItems((prev) => {
          const items = [...(prev[sourceColId] ?? [])];
          const oldIndex = items.findIndex((i) => i.id === activeItemId);
          const newIndex = items.findIndex((i) => i.id === overItemId);
          if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return prev;
          console.log('[DnD] dragOver: same-column reorder', { oldIndex, newIndex });
          return { ...prev, [sourceColId]: arrayMove(items, oldIndex, newIndex) };
        });
      }
      return;
    }

    // 列をまたぐ移動
    console.log('[DnD] dragOver: cross-column move', sourceColId, '->', targetColId);
    setColumnItems((prev) => {
      const sourceItems = [...(prev[sourceColId] ?? [])];
      const targetItems = [...(prev[targetColId!] ?? [])];
      const sourceIndex = sourceItems.findIndex((i) => i.id === activeItemId);
      if (sourceIndex === -1) return prev;

      const [moved] = sourceItems.splice(sourceIndex, 1);

      if (isTaskId(overItemId)) {
        const overIndex = targetItems.findIndex((i) => i.id === overItemId);
        if (overIndex !== -1) {
          targetItems.splice(overIndex, 0, moved);
        } else {
          targetItems.push(moved);
        }
      } else {
        targetItems.push(moved);
      }

      return { ...prev, [sourceColId]: sourceItems, [targetColId!]: targetItems };
    });
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) {
      console.log('[DnD] dragEnd: no over target, cancelled');
      return;
    }

    const activeItemId = active.id as string;
    const overItemId = over.id as string;

    console.log('[DnD] dragEnd', {
      active: activeItemId,
      activeType: isColumnId(activeItemId) ? 'COLUMN' : 'TASK',
      over: overItemId,
      overType: isColumnId(overItemId) ? 'COLUMN' : 'TASK',
    });

    // 列の並び替え完了
    if (isColumnId(activeItemId) && isColumnId(overItemId)) {
      const cols = localColumnsRef.current;
      const oldIndex = cols.findIndex(c => columnDndId(c.id) === activeItemId);
      const newIndex = cols.findIndex(c => columnDndId(c.id) === overItemId);
      console.log('[DnD] dragEnd: column reorder', { oldIndex, newIndex, same: oldIndex === newIndex });
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const reordered = arrayMove(cols, oldIndex, newIndex);
        const withOrder = reordered.map((c, i) => ({ ...c, sortOrder: i }));
        setLocalColumns(withOrder);
        onReorderColumns(withOrder.map((c, i) => ({ id: c.id, sortOrder: i })));
        console.log('[DnD] dragEnd: column reorder SUCCESS');
      }
      return;
    }

    // 列の上にカードをドロップ（列ドラッグ中にカードが列の上にある場合）
    if (isColumnId(activeItemId) && isTaskId(overItemId)) {
      console.log('[DnD] dragEnd: column dropped on task, treating as column reorder cancelled');
      return;
    }

    // カードの移動完了 → APIに送信
    if (isTaskId(activeItemId)) {
      const payload = buildReorderPayload(columnItemsRef.current);
      console.log('[DnD] dragEnd: card reorder, payload items:', payload.length);
      onReorder(payload);
    }
  }, [onReorderColumns, onReorder]);

  const handleDragCancel = useCallback(() => {
    console.log('[DnD] dragCancel');
    setActiveId(null);
    // ドラッグキャンセル時にpropsから再構築
    const sorted = [...columns].sort((a, b) => a.sortOrder - b.sortOrder);
    setLocalColumns(sorted);
    setColumnItems(buildColumnItems(tasks, sorted));
  }, [columns, tasks]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={customCollisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[400px]">
        <SortableContext items={columnDndIds} strategy={horizontalListSortingStrategy}>
          {localColumns.map((col) => (
            <SortableColumn
              key={col.id}
              column={col}
              items={columnItems[col.id] ?? []}
              onTaskClick={onTaskClick}
              onChecklistToggle={onChecklistToggle}
              onEditColumn={onEditColumn}
              onDeleteColumn={onDeleteColumn}
            />
          ))}
        </SortableContext>

        {/* 列追加ボタン */}
        <div className="min-w-[260px] max-w-[300px] flex-1 flex-shrink-0">
          <button
            onClick={onAddColumn}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 py-8 text-sm text-muted-foreground hover:text-foreground hover:border-muted-foreground/60 transition-colors"
          >
            <Plus className="h-4 w-4" />
            列を追加
          </button>
        </div>
      </div>

      {/* ドラッグ中のオーバーレイ */}
      <DragOverlay>
        {activeTask && (
          <div className="rounded-lg border bg-background shadow-xl p-3 w-[260px] rotate-1 opacity-95">
            <TaskCardContent task={activeTask} />
          </div>
        )}
        {activeColumn && (
          <div
            className="rounded-lg border shadow-xl w-[260px] rotate-1 opacity-90 p-3"
            style={{ backgroundColor: `${activeColumn.color ?? '#6b7280'}10`, borderColor: activeColumn.color ?? '#6b7280' }}
          >
            <div className="flex items-center gap-2 font-semibold text-sm" style={{ color: activeColumn.color ?? '#6b7280' }}>
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: activeColumn.color ?? '#6b7280' }} />
              {activeColumn.name}
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
