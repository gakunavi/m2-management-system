'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTaskMutations } from '@/hooks/use-tasks';
import { TaskTagInput } from './task-tag-input';
import { TaskNotifySettings } from './task-notify-settings';
import { TaskAssigneeSelect } from './task-assignee-select';
import {
  TASK_STATUS_OPTIONS,
  TASK_PRIORITY_OPTIONS,
} from '@/types/task';
import type { TaskDetail } from '@/types/task';

interface TaskCreateModalProps {
  defaultBoardId?: number;
  defaultColumnId?: number;
  parentTaskId?: number;
  relatedEntityType?: string;
  relatedEntityId?: number;
  onClose: () => void;
  onCreated: (task: TaskDetail) => void;
}

export function TaskCreateModal({
  defaultBoardId,
  defaultColumnId,
  parentTaskId,
  relatedEntityType: defaultRelatedType,
  relatedEntityId: defaultRelatedId,
  onClose,
  onCreated,
}: TaskCreateModalProps) {
  const { createTask } = useTaskMutations();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [memo, setMemo] = useState('');
  const [status, setStatus] = useState('todo');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [taskUrl, setTaskUrl] = useState('');
  const [assigneeUserIds, setAssigneeUserIds] = useState<number[]>([]);
  const [relatedEntityType] = useState(defaultRelatedType ?? '');
  const [relatedEntityId] = useState<number | undefined>(defaultRelatedId);
  const [notifyLevel, setNotifyLevel] = useState<string>('in_app');
  const [notifyTargetUserIds, setNotifyTargetUserIds] = useState<number[]>([]);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('タスク名は必須です');
      return;
    }
    setIsSubmitting(true);
    setError('');

    try {
      const result = await createTask.mutateAsync({
        title: title.trim(),
        description: description.trim() || null,
        memo: memo.trim() || null,
        status,
        priority,
        dueDate: dueDate || null,
        taskUrl: taskUrl.trim() || null,
        assigneeUserIds,
        scope: defaultBoardId ? 'board' : 'company',
        boardId: defaultBoardId ?? null,
        columnId: defaultColumnId ?? null,
        parentTaskId: parentTaskId ?? null,
        relatedEntityType: relatedEntityType || null,
        relatedEntityId: relatedEntityId ?? null,
        notifyLevel,
        notifyTargetUserIds,
        tagIds,
      });
      onCreated(result as unknown as TaskDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="w-full sm:max-w-lg rounded-t-xl sm:rounded-lg bg-background shadow-xl max-h-[95dvh] sm:max-h-[90vh] overflow-y-auto sm:mx-4">
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-lg font-semibold">
            {parentTaskId ? 'サブタスクを作成' : '新規タスク'}
          </h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* フォーム */}
        <div className="space-y-4 p-3 sm:p-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* 1. タスク名 */}
          <div>
            <label className="mb-1 block text-sm font-medium">タスク名 <span className="text-destructive">*</span></label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="タスク名を入力..."
              autoFocus
            />
          </div>

          {/* 2. ステータス + 優先度 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">ステータス</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {TASK_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">優先度</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {TASK_PRIORITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 3. 担当者 */}
          <div>
            <label className="mb-1 block text-sm font-medium">担当者</label>
            <TaskAssigneeSelect
              selectedUserIds={assigneeUserIds}
              onChange={setAssigneeUserIds}
            />
          </div>

          {/* 4. 期限 */}
          <div>
            <label className="mb-1 block text-sm font-medium">期限</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              {dueDate && (
                <button
                  type="button"
                  onClick={() => setDueDate('')}
                  className="rounded-md border border-input px-2 py-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  なし
                </button>
              )}
            </div>
          </div>

          {/* 5. URL */}
          <div>
            <label className="mb-1 block text-sm font-medium">URL</label>
            <input
              type="url"
              value={taskUrl}
              onChange={(e) => setTaskUrl(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="https://..."
            />
          </div>

          {/* 6. タグ */}
          <div>
            <label className="mb-1 block text-sm font-medium">タグ</label>
            <TaskTagInput selectedTagIds={tagIds} onChange={setTagIds} />
          </div>

          {/* 8. 説明 */}
          <div>
            <label className="mb-1 block text-sm font-medium">説明</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full min-h-[60px] resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="詳細を入力..."
            />
          </div>

          {/* 9. メモ（備考） */}
          <div>
            <label className="mb-1 block text-sm font-medium">メモ（備考）</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="w-full min-h-[60px] resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="備考・メモを入力..."
            />
          </div>

          {/* 10. 通知設定 */}
          <TaskNotifySettings
            notifyLevel={notifyLevel}
            notifyTargetUserIds={notifyTargetUserIds}
            onNotifyLevelChange={setNotifyLevel}
            onNotifyTargetsChange={setNotifyTargetUserIds}
          />
        </div>

        {/* フッター */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 border-t px-3 sm:px-4 py-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-3">
          <Button variant="outline" onClick={onClose} size="sm" className="w-full sm:w-auto">
            キャンセル
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} size="sm" className="w-full sm:w-auto">
            {isSubmitting ? '作成中...' : '作成'}
          </Button>
        </div>
      </div>
    </div>
  );
}
