'use client';

import { useState, useCallback } from 'react';
import { X, CheckSquare, ListTodo, Link2, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTaskDetail, useTaskMutations } from '@/hooks/use-tasks';
import { TaskChecklist } from './task-checklist';
import { TaskSubtasks } from './task-subtasks';
import { TaskTagInput } from './task-tag-input';
import { TaskNotifySettings } from './task-notify-settings';
import {
  TASK_STATUS_OPTIONS,
  TASK_PRIORITY_OPTIONS,
} from '@/types/task';
import type { ChecklistItem } from '@/types/task';

interface TaskDetailPanelProps {
  taskId: number;
  onClose: () => void;
}

export function TaskDetailPanel({ taskId, onClose }: TaskDetailPanelProps) {
  const { data: task, isLoading } = useTaskDetail(taskId);
  const { updateTask, deleteTask } = useTaskMutations();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleFieldUpdate = useCallback(
    async (field: string, value: unknown) => {
      if (!task) return;
      try {
        await updateTask.mutateAsync({
          id: taskId,
          [field]: value,
          version: task.version,
        });
      } catch {
        // 楽観的ロックエラーはmutation側で処理
      }
    },
    [task, taskId, updateTask],
  );

  const handleChecklistUpdate = useCallback(
    async (checklist: ChecklistItem[]) => {
      if (!task) return;
      await updateTask.mutateAsync({
        id: taskId,
        checklist,
        version: task.version,
      });
    },
    [task, taskId, updateTask],
  );

  const handleTagsUpdate = useCallback(
    async (tagIds: number[]) => {
      if (!task) return;
      await updateTask.mutateAsync({
        id: taskId,
        tagIds,
        version: task.version,
      });
    },
    [task, taskId, updateTask],
  );

  const handleNotifyUpdate = useCallback(
    async (notifyLevel: string, notifyTargetUserIds: number[]) => {
      if (!task) return;
      await updateTask.mutateAsync({
        id: taskId,
        notifyLevel,
        notifyTargetUserIds,
        version: task.version,
      });
    },
    [task, taskId, updateTask],
  );

  const handleDelete = async () => {
    if (!confirm('このタスクを削除しますか？サブタスクも全て削除されます。')) return;
    setIsDeleting(true);
    try {
      await deleteTask.mutateAsync(taskId);
      onClose();
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading || !task) {
    return (
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg border-l bg-background shadow-xl">
        <div className="flex h-full items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  const statusOpt = TASK_STATUS_OPTIONS.find((o) => o.value === task.status);

  return (
    <>
      {/* バックドロップ */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />

      {/* パネル */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg overflow-y-auto border-l bg-background shadow-xl">
        {/* ヘッダー */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{task.taskNo}</span>
            <span
              className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white"
              style={{ backgroundColor: statusOpt?.color ?? '#94a3b8' }}
            >
              {statusOpt?.label ?? task.status}
            </span>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-4">
          {/* タイトル（編集可） */}
          <input
            type="text"
            defaultValue={task.title}
            onBlur={(e) => {
              if (e.target.value !== task.title) handleFieldUpdate('title', e.target.value);
            }}
            className="w-full bg-transparent text-lg font-semibold outline-none focus:ring-1 focus:ring-primary rounded px-1"
          />

          {/* 基本フィールド */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">ステータス</label>
              <select
                value={task.status}
                onChange={(e) => handleFieldUpdate('status', e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                {TASK_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">優先度</label>
              <select
                value={task.priority}
                onChange={(e) => handleFieldUpdate('priority', e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                {TASK_PRIORITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">担当者</label>
              <span className="block text-sm">{task.assigneeName ?? '未設定'}</span>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">期限</label>
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  defaultValue={task.dueDate ?? ''}
                  onBlur={(e) => handleFieldUpdate('dueDate', e.target.value || null)}
                  className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                />
                {task.dueDate && (
                  <button
                    type="button"
                    onClick={() => handleFieldUpdate('dueDate', null)}
                    className="rounded border border-input px-1.5 py-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    なし
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 関連先 */}
          {task.relatedEntityType && (
            <div className="flex items-center gap-2 text-sm">
              <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">
                {task.relatedEntityType === 'project' ? '案件' : task.relatedEntityType === 'customer' ? '顧客' : '代理店'}:
              </span>
              <span className="font-medium">#{task.relatedEntityId}</span>
            </div>
          )}

          {/* タグ */}
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
              タグ
            </label>
            <TaskTagInput
              selectedTagIds={task.tags.map((t) => t.id)}
              onChange={handleTagsUpdate}
            />
          </div>

          {/* 説明 */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">説明</label>
            <textarea
              defaultValue={task.description ?? ''}
              onBlur={(e) => {
                if (e.target.value !== (task.description ?? '')) {
                  handleFieldUpdate('description', e.target.value || null);
                }
              }}
              className="w-full min-h-[60px] resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="説明を入力..."
            />
          </div>

          {/* チェックリスト */}
          <div>
            <div className="mb-1 flex items-center gap-1.5">
              <CheckSquare className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">チェックリスト</span>
            </div>
            <TaskChecklist
              items={task.checklist}
              onChange={handleChecklistUpdate}
            />
          </div>

          {/* サブタスク */}
          {!task.parentTaskId && (
            <div>
              <div className="mb-1 flex items-center gap-1.5">
                <ListTodo className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">
                  サブタスク ({task.childrenDoneCount}/{task.childrenCount})
                </span>
              </div>
              <TaskSubtasks taskId={taskId} subtasks={task.children} parentTask={task} />
            </div>
          )}

          {/* 通知設定 */}
          <TaskNotifySettings
            notifyLevel={task.notifyLevel}
            notifyTargetUserIds={task.notifyTargets.map((t) => t.userId)}
            onNotifyLevelChange={(level) =>
              handleNotifyUpdate(level, task.notifyTargets.map((t) => t.userId))
            }
            onNotifyTargetsChange={(userIds) =>
              handleNotifyUpdate(task.notifyLevel, userIds)
            }
            existingTargets={task.notifyTargets}
          />

          {/* メモ（備考） */}
          <div>
            <div className="mb-1 flex items-center gap-1.5">
              <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">メモ（備考）</span>
            </div>
            <textarea
              defaultValue={task.memo ?? ''}
              onBlur={(e) => {
                if (e.target.value !== (task.memo ?? '')) {
                  handleFieldUpdate('memo', e.target.value || null);
                }
              }}
              className="w-full min-h-[80px] resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="備考・メモを入力..."
            />
          </div>

          {/* 削除ボタン */}
          <div className="border-t pt-3">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting}
              className="w-full"
            >
              {isDeleting ? '削除中...' : 'このタスクを削除'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
