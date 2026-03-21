'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, BellRing, CheckCheck, ArrowRightCircle, Info, AlertTriangle, Clock, Settings, FileText, CheckSquare, X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { useNotifications } from '@/hooks/use-notifications';
import { usePushSubscription } from '@/hooks/use-push-subscription';
import type { NotificationType, NotificationItem } from '@/types/notification';

const TYPE_CONFIG: Record<NotificationType, { icon: typeof Bell; className: string }> = {
  status_change: { icon: ArrowRightCircle, className: 'text-blue-500' },
  overdue: { icon: AlertTriangle, className: 'text-red-500' },
  stagnation: { icon: Clock, className: 'text-amber-500' },
  system: { icon: Settings, className: 'text-gray-500' },
  document_notification: { icon: FileText, className: 'text-emerald-500' },
  task_assigned: { icon: CheckSquare, className: 'text-blue-500' },
  task_completed: { icon: CheckSquare, className: 'text-green-500' },
  task_overdue: { icon: AlertTriangle, className: 'text-red-500' },
};

function getEntityPath(entity: string | null, entityId: number | null): string | null {
  if (!entity || entityId == null) return null;
  const pathMap: Record<string, string> = {
    project: '/projects',
    customer: '/customers',
    partner: '/partners',
    inquiry: '/inquiries',
    business_document: '/portal',
    task: '/tasks',
  };
  const base = pathMap[entity];
  return base ? `${base}/${entityId}` : null;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'たった今';
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}日前`;
  return new Date(dateStr).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
}

function PushNotificationToggle() {
  const { isSupported, permission, isSubscribed, isLoading, subscribe, unsubscribe } = usePushSubscription();

  if (!isSupported) return null;

  if (permission === 'denied') {
    return (
      <div className="px-3 py-2 border-b bg-muted/30">
        <p className="text-xs text-muted-foreground">
          プッシュ通知はブラウザ設定でブロックされています
        </p>
      </div>
    );
  }

  const handleToggle = () => {
    if (isLoading) return;
    if (isSubscribed) {
      unsubscribe();
    } else {
      subscribe();
    }
  };

  return (
    <div className="px-3 py-2 border-b bg-muted/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BellRing className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-foreground">プッシュ通知</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isSubscribed}
          aria-label="プッシュ通知の切替"
          disabled={isLoading}
          onClick={handleToggle}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
            isSubscribed ? 'bg-primary' : 'bg-input'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform duration-200 ${
              isSubscribed ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </div>
  );
}

function NotificationRow({
  item,
  onRead,
  onNavigate,
  onDelete,
}: {
  item: NotificationItem;
  onRead: (id: number) => void;
  onNavigate: (path: string) => void;
  onDelete: (id: number) => void;
}) {
  const typeConf = TYPE_CONFIG[item.notificationType] ?? TYPE_CONFIG.system;
  const Icon = typeConf.icon;
  const path = getEntityPath(item.relatedEntity, item.relatedEntityId);

  const handleClick = useCallback(() => {
    if (!item.isRead) onRead(item.id);
    if (path) onNavigate(path);
  }, [item.id, item.isRead, path, onRead, onNavigate]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(item.id);
  }, [item.id, onDelete]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`group w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors border-b last:border-b-0 ${
        !item.isRead ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''
      }`}
    >
      <div className="flex items-start gap-2.5">
        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${typeConf.className}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={`text-sm leading-tight truncate flex-1 ${!item.isRead ? 'font-medium' : ''}`}>
              {item.notificationTitle}
            </p>
            <div className="flex items-center gap-1 shrink-0">
              {!item.isRead && (
                <span className="h-2 w-2 rounded-full bg-blue-500" />
              )}
              <button
                type="button"
                onClick={handleDelete}
                className="h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/20 transition-opacity"
                aria-label="通知を削除"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {item.notificationMessage}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {formatRelativeTime(item.createdAt)}
          </p>
        </div>
      </div>
    </button>
  );
}

export function NotificationPopover() {
  const router = useRouter();
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead, deleteNotification, deleteAll } = useNotifications();

  const handleRead = useCallback((id: number) => {
    markAsRead.mutate(id);
  }, [markAsRead]);

  const handleNavigate = useCallback((path: string) => {
    router.push(path);
  }, [router]);

  const handleDelete = useCallback((id: number) => {
    deleteNotification.mutate(id);
  }, [deleteNotification]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="通知" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">通知</h3>
            {unreadCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {unreadCount}件の未読
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => markAllAsRead.mutate()}
                disabled={markAllAsRead.isPending}
              >
                <CheckCheck className="h-3.5 w-3.5 mr-1" />
                すべて既読
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-destructive hover:text-destructive"
                onClick={() => deleteAll.mutate()}
                disabled={deleteAll.isPending}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                すべて削除
              </Button>
            )}
          </div>
        </div>

        {/* Push notification toggle */}
        <PushNotificationToggle />

        {/* Body */}
        <div className="max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="p-3 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-2.5">
                  <Skeleton className="h-4 w-4 mt-0.5 shrink-0 rounded" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-12 text-center">
              <Info className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">通知はありません</p>
            </div>
          ) : (
            notifications.map((n) => (
              <NotificationRow
                key={n.id}
                item={n}
                onRead={handleRead}
                onNavigate={handleNavigate}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
