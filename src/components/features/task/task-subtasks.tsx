'use client';

import { useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Check, Circle, Clock, Pause, GripVertical } from 'lucide-react';
import { useTaskMutations } from '@/hooks/use-tasks';
import { TASK_STATUS_OPTIONS } from '@/types/task';
import type { TaskListItem, TaskDetail } from '@/types/task';
import { cn } from '@/lib/utils';

interface TaskSubtasksProps {
  taskId: number;
  subtasks: TaskListItem[];
  parentTask: TaskDetail;
  onNavigateToChild?: (childId: number) => void;
}

const STATUS_ICONS: Record<string, typeof Check> = {
  todo: Circle,
  in_progress: Clock,
  done: Check,
  on_hold: Pause,
};

// ============================================
// ソータブルサブタスク行
// ============================================

function SortableSubtaskRow({
  child,
  onNavigateToChild,
}: {
  child: TaskListItem;
  onNavigateToChild?: (childId: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: child.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const StatusIcon = STATUS_ICONS[child.status] ?? Circle;
  const statusOpt = TASK_STATUS_OPTIONS.find((o) => o.value === child.status);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer',
        isDragging && 'shadow-md bg-background',
      )}
      onClick={() => onNavigateToChild?.(child.id)}
    >
      {/* ドラッグハンドル */}
      <div
        className="cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-muted"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-3 w-3 text-muted-foreground/40 hover:text-muted-foreground" />
      </div>

      <StatusIcon
        className="h-4 w-4 flex-shrink-0"
        style={{ color: statusOpt?.color ?? '#94a3b8' }}
      />
      <span className={`flex-1 text-sm ${child.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
        {child.title}
      </span>
      {child.assignees.length > 0 && (
        <span className="text-xs text-muted-foreground">{child.assignees.map(a => a.userName).join(', ')}</span>
      )}
      {child.dueDate && (
        <span className={`text-xs ${
          child.status !== 'done' && new Date(child.dueDate) < new Date()
            ? 'text-red-600'
            : 'text-muted-foreground'
        }`}>
          {child.dueDate}
        </span>
      )}
    </div>
  );
}

// ============================================
// サブタスク行（DragOverlay用）
// ============================================

function SubtaskOverlay({ child }: { child: TaskListItem }) {
  const StatusIcon = STATUS_ICONS[child.status] ?? Circle;
  const statusOpt = TASK_STATUS_OPTIONS.find((o) => o.value === child.status);

  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 bg-background shadow-xl border">
      <GripVertical className="h-3 w-3 text-muted-foreground/40" />
      <StatusIcon className="h-4 w-4 flex-shrink-0" style={{ color: statusOpt?.color ?? '#94a3b8' }} />
      <span className="text-sm">{child.title}</span>
    </div>
  );
}

// ============================================
// メインコンポーネント
// ============================================

export function TaskSubtasks({ taskId, subtasks: children, parentTask, onNavigateToChild }: TaskSubtasksProps) {
  const { createTask, reorderTasks } = useTaskMutations();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);

  // ローカルの並び順（D&D即時反映用）
  const [localChildren, setLocalChildren] = useState(children);
  const [prevChildren, setPrevChildren] = useState(children);
  if (children !== prevChildren) {
    setPrevChildren(children);
    setLocalChildren(children);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const activeChild = activeId ? localChildren.find(c => c.id === activeId) : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(Number(event.active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const oldIndex = localChildren.findIndex(c => c.id === Number(active.id));
    const newIndex = localChildren.findIndex(c => c.id === Number(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(localChildren, oldIndex, newIndex);
    setLocalChildren(reordered);

    // APIでsortOrderを更新
    const items = reordered.map((c, i) => ({
      id: c.id,
      status: c.status,
      sortOrder: i,
    }));
    reorderTasks.mutate(items);
  }, [localChildren, reorderTasks]);

  const handleCreateSubtask = async () => {
    if (!newTitle.trim()) return;
    setIsCreating(true);
    try {
      await createTask.mutateAsync({
        title: newTitle.trim(),
        parentTaskId: taskId,
        scope: parentTask.scope,
        businessId: parentTask.businessId,
        relatedEntityType: parentTask.relatedEntityType,
        relatedEntityId: parentTask.relatedEntityId,
        tagIds: parentTask.tags.map((t) => t.id),
        status: 'todo',
        priority: 'medium',
        notifyLevel: parentTask.notifyLevel,
      });
      setNewTitle('');
      setShowAddForm(false);
    } finally {
      setIsCreating(false);
    }
  };

  const childIds = localChildren.map(c => c.id);

  return (
    <div className="space-y-1">
      {/* 進捗バー */}
      {localChildren.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-green-500 transition-all"
              style={{
                width: `${localChildren.length > 0
                  ? (localChildren.filter((c) => c.status === 'done').length / localChildren.length) * 100
                  : 0}%`,
              }}
            />
          </div>
          <span>
            {localChildren.filter((c) => c.status === 'done').length}/{localChildren.length}
          </span>
        </div>
      )}

      {/* サブタスク一覧（D&D対応） */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={childIds} strategy={verticalListSortingStrategy}>
          {localChildren.map((child) => (
            <SortableSubtaskRow
              key={child.id}
              child={child}
              onNavigateToChild={onNavigateToChild}
            />
          ))}
        </SortableContext>

        <DragOverlay>
          {activeChild && <SubtaskOverlay child={activeChild} />}
        </DragOverlay>
      </DndContext>

      {/* 追加フォーム */}
      {showAddForm ? (
        <div className="flex items-center gap-2 mt-1">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); handleCreateSubtask(); }
              if (e.key === 'Escape') { setShowAddForm(false); setNewTitle(''); }
            }}
            className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm"
            placeholder="サブタスク名..."
            autoFocus
            disabled={isCreating}
          />
          <button
            onClick={handleCreateSubtask}
            disabled={isCreating || !newTitle.trim()}
            className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            追加
          </button>
          <button
            onClick={() => { setShowAddForm(false); setNewTitle(''); }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            キャンセル
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50"
        >
          <Plus className="h-3.5 w-3.5" />
          サブタスクを追加
        </button>
      )}
    </div>
  );
}
