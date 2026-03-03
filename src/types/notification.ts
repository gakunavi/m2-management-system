export type NotificationType = 'status_change' | 'overdue' | 'stagnation' | 'system' | 'document_notification';

export interface NotificationItem {
  id: number;
  notificationType: NotificationType;
  notificationTitle: string;
  notificationMessage: string;
  isRead: boolean;
  relatedEntity: string | null;
  relatedEntityId: number | null;
  createdAt: string;
}
