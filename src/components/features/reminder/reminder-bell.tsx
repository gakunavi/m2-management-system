'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { AlarmClock, Calendar, AlertCircle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

// ============================================
// 型定義
// ============================================

interface ReminderItem {
  id: number;
  projectId: number;
  projectNo: string;
  customerName: string | null;
  reminderDate: string;
  title: string;
  isCompleted: boolean;
  isOverdue: boolean;
  isDueToday: boolean;
}

interface RemindersResponse {
  success: boolean;
  data: ReminderItem[];
  meta: { total: number; overdueCount: number; dueTodayCount: number };
}

// ============================================
// メインコンポーネント
// ============================================

export function ReminderBell() {
  const router = useRouter();
  const { toast } = useToast();
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const isInternal = hasRole(['admin', 'staff']);

  const { data: response } = useQuery<RemindersResponse>({
    queryKey: ['my-reminders'],
    queryFn: async () => {
      const res = await fetch('/api/v1/reminders');
      if (!res.ok) throw new Error('リマインダーの取得に失敗しました');
      return res.json();
    },
    staleTime: 60 * 1000, // 1分キャッシュ
    refetchInterval: 5 * 60 * 1000, // 5分ごとにリフレッシュ
    enabled: isInternal,
  });

  const badgeCount = (response?.meta?.overdueCount ?? 0) + (response?.meta?.dueTodayCount ?? 0);
  const reminders = response?.data ?? [];

  // 外部クリックで閉じる
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // partner ロールには表示しない（Hooks の後に配置）
  if (!isInternal) return null;

  const handleComplete = async (reminder: ReminderItem) => {
    try {
      const res = await fetch(
        `/api/v1/projects/${reminder.projectId}/reminders/${reminder.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isCompleted: true }),
        },
      );
      if (!res.ok) throw new Error('更新に失敗しました');
      queryClient.invalidateQueries({ queryKey: ['my-reminders'] });
    } catch (err) {
      const message = err instanceof Error ? err.message : '更新に失敗しました';
      toast({ message, type: 'error' });
    }
  };

  const handleNavigate = (reminder: ReminderItem) => {
    setOpen(false);
    router.push(`/projects/${reminder.projectId}`);
  };

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative h-9 w-9"
        onClick={() => setOpen(!open)}
        aria-label="リマインダー"
      >
        <AlarmClock className="h-4.5 w-4.5" />
        {badgeCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border bg-popover shadow-lg z-50">
          <div className="border-b px-4 py-2.5">
            <h3 className="text-sm font-semibold">リマインダー</h3>
            {response?.meta && (
              <p className="text-xs text-muted-foreground">
                {response.meta.overdueCount > 0 && (
                  <span className="text-destructive font-medium">
                    {response.meta.overdueCount}件の期限超過
                  </span>
                )}
                {response.meta.overdueCount > 0 && response.meta.dueTodayCount > 0 && ' / '}
                {response.meta.dueTodayCount > 0 && `${response.meta.dueTodayCount}件が本日期限`}
                {response.meta.overdueCount === 0 && response.meta.dueTodayCount === 0 && '未完了のリマインダーはありません'}
              </p>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {reminders.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                リマインダーはありません
              </div>
            ) : (
              reminders.slice(0, 10).map((r) => (
                <div
                  key={r.id}
                  className={cn(
                    'flex items-start gap-2 border-b last:border-b-0 px-4 py-2.5 hover:bg-accent/50 transition-colors',
                    r.isOverdue && 'bg-destructive/5',
                    r.isDueToday && 'bg-yellow-50',
                  )}
                >
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleNavigate(r)}>
                    <div className="flex items-center gap-1.5">
                      {r.isOverdue && <AlertCircle className="h-3 w-3 text-destructive shrink-0" />}
                      <span className="text-sm font-medium truncate">{r.title}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{r.projectNo}</span>
                      <span className="inline-flex items-center gap-0.5">
                        <Calendar className="h-2.5 w-2.5" />
                        {r.reminderDate}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-muted-foreground hover:text-primary"
                    onClick={() => handleComplete(r)}
                    aria-label="完了にする"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>

          {reminders.length > 10 && (
            <div className="border-t px-4 py-2 text-center">
              <span className="text-xs text-muted-foreground">
                他 {reminders.length - 10} 件
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
