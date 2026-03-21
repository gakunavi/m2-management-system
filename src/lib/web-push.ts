import webpush from 'web-push';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:noreply@gakunavi.co.jp',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/**
 * 指定ユーザーの全デバイスにWeb Push通知を送信
 * 期限切れサブスクリプション(410/404)は自動削除
 */
export async function sendWebPushToUser(userId: number, payload: PushPayload): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  if (subscriptions.length === 0) return;

  const payloadStr = JSON.stringify(payload);
  const expiredIds: number[] = [];

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payloadStr,
        );
      } catch (error: unknown) {
        const statusCode = (error as { statusCode?: number })?.statusCode;
        if (statusCode === 410 || statusCode === 404) {
          expiredIds.push(sub.id);
        } else {
          logger.warn(`Push送信失敗 userId=${userId} status=${statusCode}`, undefined, 'WebPush');
        }
      }
    }),
  );

  if (expiredIds.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { id: { in: expiredIds } },
    }).catch(() => {});
  }
}

/**
 * 複数ユーザーにWeb Push通知を送信
 */
export async function sendWebPushToUsers(userIds: number[], payload: PushPayload): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
  await Promise.allSettled(
    userIds.map((userId) => sendWebPushToUser(userId, payload)),
  );
}
