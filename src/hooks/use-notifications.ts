'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NotificationItem } from '@/types/notification';

const NOTIFICATION_KEY = ['notifications'];
const POLL_INTERVAL = 60_000;

interface NotificationListResponse {
  notifications: NotificationItem[];
  unreadCount: number;
  meta: { total: number; page: number; pageSize: number; totalPages: number };
}

async function fetchNotifications(page: number, pageSize: number): Promise<NotificationListResponse> {
  const res = await fetch(`/api/v1/notifications?page=${page}&pageSize=${pageSize}`);
  if (!res.ok) throw new Error('通知の取得に失敗しました');
  const json = await res.json();
  return json.data as NotificationListResponse;
}

async function fetchUnreadCount(): Promise<number> {
  const res = await fetch('/api/v1/notifications?pageSize=0');
  if (!res.ok) return 0;
  const json = await res.json();
  return json.data?.unreadCount ?? 0;
}

export function useNotifications(page = 1, pageSize = 20) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: [...NOTIFICATION_KEY, page, pageSize],
    queryFn: () => fetchNotifications(page, pageSize),
    refetchInterval: POLL_INTERVAL,
  });

  const markAsRead = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/v1/notifications/${id}/read`, { method: 'PATCH' });
      if (!res.ok) throw new Error('既読にできませんでした');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEY });
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/notifications/read-all', { method: 'PATCH' });
      if (!res.ok) throw new Error('一括既読にできませんでした');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEY });
    },
  });

  const deleteNotification = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/v1/notifications/${id}/delete`, { method: 'DELETE' });
      if (!res.ok) throw new Error('通知を削除できませんでした');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEY });
    },
  });

  const deleteAll = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/notifications/delete-all', { method: 'DELETE' });
      if (!res.ok) throw new Error('一括削除できませんでした');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEY });
    },
  });

  return {
    notifications: data?.notifications ?? [],
    unreadCount: data?.unreadCount ?? 0,
    meta: data?.meta,
    isLoading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAll,
  };
}

export function useUnreadCount() {
  const { data } = useQuery({
    queryKey: [...NOTIFICATION_KEY, 'unread-count'],
    queryFn: fetchUnreadCount,
    refetchInterval: POLL_INTERVAL,
  });
  return data ?? 0;
}
