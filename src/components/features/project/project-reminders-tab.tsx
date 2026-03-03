'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Plus,
  Check,
  Trash2,
  Calendar,
  Mail,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// ============================================
// 型定義
// ============================================

interface ReminderData {
  id: number;
  projectId: number;
  assignedTo: number;
  reminderDate: string;
  title: string;
  description: string | null;
  notifyEmail: boolean;
  isCompleted: boolean;
  completedAt: string | null;
  assignee: { id: number; userName: string } | null;
  creator: { id: number; userName: string } | null;
}

interface UserOption {
  id: number;
  userName: string;
  userRole: string;
}

// ============================================
// ヘルパー
// ============================================

function isOverdue(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  return d < today;
}

function isDueToday(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  return d.getTime() === today.getTime();
}

// ============================================
// スケルトン
// ============================================

function RemindersSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

// ============================================
// Props
// ============================================

interface Props {
  entityId: number;
}

// ============================================
// メインコンポーネント
// ============================================

export function ProjectRemindersTab({ entityId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingReminder, setDeletingReminder] = useState<ReminderData | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // リマインダー一覧
  const { data: response, isLoading } = useQuery<{ data: ReminderData[] }>({
    queryKey: ['project-reminders', entityId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/projects/${entityId}/reminders`);
      if (!res.ok) throw new Error('リマインダーの取得に失敗しました');
      return res.json();
    },
  });

  // ユーザー一覧（担当者選択用）
  const { data: usersData } = useQuery<{ data: UserOption[] }>({
    queryKey: ['users-for-reminder'],
    queryFn: async () => {
      const res = await fetch('/api/v1/users?pageSize=100&isActive=true');
      if (!res.ok) throw new Error('ユーザーの取得に失敗しました');
      return res.json();
    },
    enabled: showForm,
  });

  const reminders = response?.data ?? [];
  // 担当者は社内ユーザー（admin/staff）のみ
  const users = (usersData?.data ?? []).filter(
    (u) => u.userRole === 'admin' || u.userRole === 'staff',
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['project-reminders', entityId] });
    queryClient.invalidateQueries({ queryKey: ['my-reminders'] });
  };

  // ============================================
  // 新規作成
  // ============================================

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setReminderDate('');
    setAssignedTo('');
    setNotifyEmail(false);
    setShowForm(false);
  };

  const handleCreate = async () => {
    if (!title.trim() || !reminderDate || !assignedTo) {
      toast({ message: 'タイトル・日付・担当者は必須です', type: 'error' });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/v1/projects/${entityId}/reminders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          reminderDate,
          assignedTo: parseInt(assignedTo, 10),
          notifyEmail,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(err.error?.message ?? '作成に失敗しました');
      }
      toast({ message: 'リマインダーを作成しました', type: 'success' });
      resetForm();
      invalidate();
    } catch (err) {
      const message = err instanceof Error ? err.message : '作成に失敗しました';
      toast({ message, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================
  // 完了トグル
  // ============================================

  const handleToggleComplete = async (reminder: ReminderData) => {
    try {
      const res = await fetch(
        `/api/v1/projects/${entityId}/reminders/${reminder.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isCompleted: !reminder.isCompleted }),
        },
      );
      if (!res.ok) throw new Error('更新に失敗しました');
      invalidate();
    } catch (err) {
      const message = err instanceof Error ? err.message : '更新に失敗しました';
      toast({ message, type: 'error' });
    }
  };

  // ============================================
  // 削除
  // ============================================

  const handleDeleteConfirm = async () => {
    if (!deletingReminder) return;

    setIsDeleting(true);
    try {
      const res = await fetch(
        `/api/v1/projects/${entityId}/reminders/${deletingReminder.id}`,
        { method: 'DELETE' },
      );
      if (!res.ok && res.status !== 204) throw new Error('削除に失敗しました');
      toast({ message: 'リマインダーを削除しました', type: 'success' });
      setDeletingReminder(null);
      invalidate();
    } catch (err) {
      const message = err instanceof Error ? err.message : '削除に失敗しました';
      toast({ message, type: 'error' });
    } finally {
      setIsDeleting(false);
    }
  };

  // ============================================
  // ローディング
  // ============================================

  if (isLoading) return <RemindersSkeleton />;

  // ============================================
  // レンダリング
  // ============================================

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {reminders.filter((r) => !r.isCompleted).length} 件の未完了リマインダー
        </p>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          追加
        </Button>
      </div>

      {/* 作成フォーム */}
      {showForm && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="rem-title">タイトル *</Label>
              <Input
                id="rem-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="フォローアップ内容"
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rem-date">リマインダー日 *</Label>
              <Input
                id="rem-date"
                type="date"
                value={reminderDate}
                onChange={(e) => setReminderDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>担当者 *</Label>
              <Select
                value={assignedTo}
                onValueChange={setAssignedTo}
              >
                <SelectTrigger>
                  <SelectValue placeholder="担当者を選択" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.userName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="rem-desc">メモ</Label>
              <textarea
                id="rem-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="補足メモ（任意）"
                className="w-full min-h-[60px] resize-y rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.checked)}
                className="rounded border-input"
              />
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              期日にメール通知
            </label>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={handleCreate} disabled={isSubmitting}>
              {isSubmitting ? '作成中...' : '作成'}
            </Button>
            <Button size="sm" variant="ghost" onClick={resetForm} disabled={isSubmitting}>
              キャンセル
            </Button>
          </div>
        </div>
      )}

      {/* 一覧 */}
      {reminders.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-12 w-12 text-muted-foreground/50 mb-4" />}
          title="リマインダーはまだありません"
          description="フォローアップや確認事項のリマインダーを設定できます。"
        />
      ) : (
        <div className="space-y-2">
          {reminders.map((reminder) => {
            const overdue = !reminder.isCompleted && isOverdue(reminder.reminderDate);
            const dueToday = !reminder.isCompleted && isDueToday(reminder.reminderDate);

            return (
              <div
                key={reminder.id}
                className={cn(
                  'flex items-start gap-3 rounded-lg border px-4 py-3 transition-colors',
                  reminder.isCompleted && 'opacity-60 bg-muted/30',
                  overdue && 'border-destructive/40 bg-destructive/5',
                  dueToday && 'border-yellow-300 bg-yellow-50',
                )}
              >
                {/* 完了チェック */}
                <button
                  onClick={() => handleToggleComplete(reminder)}
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors',
                    reminder.isCompleted
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-muted-foreground/40 hover:border-primary',
                  )}
                  aria-label={reminder.isCompleted ? '未完了に戻す' : '完了にする'}
                >
                  {reminder.isCompleted && <Check className="h-3 w-3" />}
                </button>

                {/* 内容 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        'text-sm font-medium',
                        reminder.isCompleted && 'line-through',
                      )}
                    >
                      {reminder.title}
                    </span>
                    {overdue && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                        <AlertCircle className="h-3 w-3" />
                        期限超過
                      </span>
                    )}
                    {dueToday && !overdue && (
                      <span className="text-xs font-medium text-yellow-700">
                        本日期限
                      </span>
                    )}
                    {reminder.notifyEmail && (
                      <span title="メール通知ON"><Mail className="h-3 w-3 text-muted-foreground" /></span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {reminder.reminderDate}
                    </span>
                    <span>→ {reminder.assignee?.userName ?? '不明'}</span>
                  </div>
                  {reminder.description && (
                    <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">
                      {reminder.description}
                    </p>
                  )}
                </div>

                {/* 削除 */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setDeletingReminder(reminder)}
                  aria-label="リマインダーを削除"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* 削除確認 */}
      <ConfirmModal
        open={deletingReminder !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingReminder(null);
        }}
        title="リマインダーを削除しますか？"
        description="このリマインダーを削除します。この操作は元に戻せません。"
        confirmLabel="削除する"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
        isLoading={isDeleting}
      />
    </div>
  );
}
