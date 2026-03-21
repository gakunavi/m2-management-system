import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';
import { sendWebPushToUser, sendWebPushToUsers } from '@/lib/web-push';
import type { NotificationType } from '@/types/notification';

interface CreateNotificationParams {
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  relatedEntity?: string;
  relatedEntityId?: number;
}

function buildEntityUrl(entity?: string, entityId?: number): string {
  if (!entity || !entityId) return '/';
  const pathMap: Record<string, string> = {
    project: '/projects',
    customer: '/customers',
    partner: '/partners',
    inquiry: '/inquiries',
    business_document: '/portal',
    task: '/tasks',
  };
  const base = pathMap[entity];
  return base ? `${base}/${entityId}` : '/';
}

export async function createNotification(params: CreateNotificationParams): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: params.userId,
      notificationType: params.type,
      notificationTitle: params.title,
      notificationMessage: params.message,
      relatedEntity: params.relatedEntity ?? null,
      relatedEntityId: params.relatedEntityId ?? null,
    },
  });

  // メール送信（非同期・失敗してもDB通知は保持）
  sendEmailForUser(params.userId, params.title, params.message).catch(() => {});

  // Web Push送信（非同期・失敗してもDB通知は保持）
  sendWebPushToUser(params.userId, {
    title: params.title,
    body: params.message,
    url: buildEntityUrl(params.relatedEntity, params.relatedEntityId),
    tag: `notification-${params.type}`,
  }).catch(() => {});
}

export async function createNotificationsForUsers(
  userIds: number[],
  params: Omit<CreateNotificationParams, 'userId'>,
): Promise<void> {
  if (userIds.length === 0) return;

  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      notificationType: params.type,
      notificationTitle: params.title,
      notificationMessage: params.message,
      relatedEntity: params.relatedEntity ?? null,
      relatedEntityId: params.relatedEntityId ?? null,
    })),
  });

  // 各ユーザーにメール送信（非同期・失敗してもDB通知は保持）
  for (const userId of userIds) {
    sendEmailForUser(userId, params.title, params.message).catch(() => {});
  }

  // Web Push送信（非同期・失敗してもDB通知は保持）
  sendWebPushToUsers(userIds, {
    title: params.title,
    body: params.message,
    url: buildEntityUrl(params.relatedEntity, params.relatedEntityId),
    tag: `notification-${params.type}`,
  }).catch(() => {});
}

/**
 * ユーザーIDからメールアドレスを取得してメール送信
 */
async function sendEmailForUser(userId: number, subject: string, message: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { userEmail: true, userIsActive: true },
  });

  if (!user || !user.userIsActive) return;

  await sendEmail({
    to: user.userEmail,
    subject: `[管理システム] ${subject}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a2e; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">
          ${subject}
        </h2>
        <p style="color: #334155; line-height: 1.6;">${message}</p>
        <p style="color: #64748b; font-size: 12px; margin-top: 24px;">
          管理システムからの自動通知です。
        </p>
      </div>
    `,
  });
}
