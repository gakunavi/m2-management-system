'use client';

import { useState } from 'react';
import { Plus, Check, Circle, Clock, Pause } from 'lucide-react';
import { useTaskMutations } from '@/hooks/use-tasks';
import { TASK_STATUS_OPTIONS } from '@/types/task';
import type { TaskListItem, TaskDetail } from '@/types/task';

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

export function TaskSubtasks({ taskId, subtasks: children, parentTask, onNavigateToChild }: TaskSubtasksProps) {
  const { createTask } = useTaskMutations();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

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

  return (
    <div className="space-y-1">
      {/* 進捗バー */}
      {children.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-green-500 transition-all"
              style={{
                width: `${children.length > 0
                  ? (children.filter((c) => c.status === 'done').length / children.length) * 100
                  : 0}%`,
              }}
            />
          </div>
          <span>
            {children.filter((c) => c.status === 'done').length}/{children.length}
          </span>
        </div>
      )}

      {/* サブタスク一覧 */}
      {children.map((child) => {
        const StatusIcon = STATUS_ICONS[child.status] ?? Circle;
        const statusOpt = TASK_STATUS_OPTIONS.find((o) => o.value === child.status);

        return (
          <div
            key={child.id}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer"
            onClick={() => onNavigateToChild?.(child.id)}
          >
            <StatusIcon
              className="h-4 w-4 flex-shrink-0"
              style={{ color: statusOpt?.color ?? '#94a3b8' }}
            />
            <span className={`flex-1 text-sm ${child.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
              {child.title}
            </span>
            {child.assigneeName && (
              <span className="text-xs text-muted-foreground">{child.assigneeName}</span>
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
      })}

      {/* 追加フォーム */}
      {showAddForm ? (
        <div className="flex items-center gap-2 mt-1">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleCreateSubtask(); }
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
