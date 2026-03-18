import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createNotificationsForUsers } from '@/lib/notification-helper';
import { logger } from '@/lib/logger';

// ============================================
// POST /api/v1/cron/task-notifications
// タスク期限通知（期限1日前 + 期限超過）
// CRON_SECRET で保護、外部スケジューラー（日次）から呼び出し
// ============================================

export const dynamic = 'force-dynamic';

/**
 * 日付を YYYY/MM/DD 形式（日本語ロケール）にフォーマット
 */
function formatDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
}

export async function POST(request: NextRequest) {
  try {
    // CRON_SECRET 認証
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: { message: 'Unauthorized' } },
        { status: 401 },
      );
    }

    // UTC 基準で今日・明日の境界を計算
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
    const dayAfterTomorrowStart = new Date(tomorrowStart);
    dayAfterTomorrowStart.setUTCDate(dayAfterTomorrowStart.getUTCDate() + 1);

    // ============================================
    // Step 1: 期限1日前通知（dueDate = 明日）
    // ============================================
    const upcomingTasks = await prisma.task.findMany({
      where: {
        dueDate: { gte: tomorrowStart, lt: dayAfterTomorrowStart },
        status: { notIn: ['done'] },
        isArchived: false,
        notifyLevel: { not: 'none' },
        parentTaskId: null,
      },
      include: {
        notifyTargets: { select: { userId: true } },
      },
    });

    let upcomingNotified = 0;

    for (const task of upcomingTasks) {
      try {
        const targetUserIds = task.notifyTargets.map((t) => t.userId);
        // フォールバック: 通知対象未設定の場合は担当者に送信
        const userIds =
          targetUserIds.length > 0
            ? targetUserIds
            : task.assigneeId
              ? [task.assigneeId]
              : [];

        if (userIds.length === 0) continue;

        const dueDateFormatted = task.dueDate ? formatDate(task.dueDate) : '';

        await createNotificationsForUsers(userIds, {
          type: 'task_overdue',
          title: `タスク期限が明日です: ${task.title}`,
          message: `タスク「${task.title}」(${task.taskNo}) の期限が明日 (${dueDateFormatted}) です。`,
          relatedEntity: 'task',
          relatedEntityId: task.id,
        });

        upcomingNotified++;
      } catch (taskError) {
        logger.error(
          `Task upcoming notification failed for task ${task.id}`,
          taskError,
          'CronTaskNotifications',
        );
      }
    }

    // ============================================
    // Step 2: 期限超過通知（dueDate < 今日）
    // ============================================
    const overdueTasks = await prisma.task.findMany({
      where: {
        dueDate: { lt: todayStart },
        status: { notIn: ['done'] },
        isArchived: false,
        notifyLevel: { not: 'none' },
        parentTaskId: null,
      },
      include: {
        notifyTargets: { select: { userId: true } },
      },
    });

    let overdueNotified = 0;

    for (const task of overdueTasks) {
      try {
        // 本日すでに通知済みかチェック（重複送信防止）
        const alreadyNotifiedToday = await prisma.notification.count({
          where: {
            relatedEntity: 'task',
            relatedEntityId: task.id,
            notificationType: 'task_overdue',
            createdAt: { gte: todayStart },
          },
        });

        if (alreadyNotifiedToday > 0) continue;

        const targetUserIds = task.notifyTargets.map((t) => t.userId);
        const userIds =
          targetUserIds.length > 0
            ? targetUserIds
            : task.assigneeId
              ? [task.assigneeId]
              : [];

        if (userIds.length === 0) continue;

        const dueDateFormatted = task.dueDate ? formatDate(task.dueDate) : '';

        await createNotificationsForUsers(userIds, {
          type: 'task_overdue',
          title: `タスクが期限超過です: ${task.title}`,
          message: `タスク「${task.title}」(${task.taskNo}) の期限 (${dueDateFormatted}) を過ぎています。`,
          relatedEntity: 'task',
          relatedEntityId: task.id,
        });

        overdueNotified++;
      } catch (taskError) {
        logger.error(
          `Task overdue notification failed for task ${task.id}`,
          taskError,
          'CronTaskNotifications',
        );
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        upcomingNotified,
        overdueNotified,
      },
    });
  } catch (error) {
    logger.error('Task notification cron error', error, 'CronTaskNotifications');
    return NextResponse.json(
      { success: false, error: { message: 'Internal error' } },
      { status: 500 },
    );
  }
}
