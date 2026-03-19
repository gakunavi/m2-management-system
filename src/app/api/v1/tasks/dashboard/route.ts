import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { formatTaskListItem } from '@/lib/task-helpers';

export const dynamic = 'force-dynamic';

const taskListInclude = {
  assignees: { select: { id: true, userId: true, userName: true }, orderBy: { assignedAt: 'asc' as const } },
  createdBy: { select: { userName: true } },
  business: { select: { businessName: true } },
  column: { select: { id: true, name: true, color: true } },
  tags: {
    include: {
      tag: { select: { id: true, name: true, color: true } },
    },
  },
  _count: { select: { children: true, attachments: true } },
  children: { select: { id: true, status: true } },
} as const;

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) {
      throw ApiError.forbidden();
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const threeDaysLater = new Date(todayStart);
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);

    const baseWhere = {
      assignees: { some: { userId: user.id } },
      isArchived: false,
      parentTaskId: null,
      status: { notIn: ['done'] as string[] },
    };

    // 4つのクエリを並列実行
    const [myTasks, upcomingTasks, overdueTasks, withDueDateTasks] = await Promise.all([
      // 1. マイタスク（全アクティブタスク、最新5件）
      prisma.task.findMany({
        where: baseWhere,
        orderBy: { updatedAt: 'desc' },
        take: 5,
        include: taskListInclude,
      }),
      // 2. 期限間近マイタスク（3日以内、期限順）
      prisma.task.findMany({
        where: {
          ...baseWhere,
          dueDate: {
            gte: todayStart,
            lte: threeDaysLater,
          },
        },
        orderBy: { dueDate: 'asc' },
        take: 5,
        include: taskListInclude,
      }),
      // 3. 期限超過マイタスク（期限切れ、新しい順）
      prisma.task.findMany({
        where: {
          ...baseWhere,
          dueDate: { lt: todayStart },
        },
        orderBy: { dueDate: 'desc' },
        take: 5,
        include: taskListInclude,
      }),
      // 4. 期限付きマイタスク（期限があるもの、期限順）
      prisma.task.findMany({
        where: {
          ...baseWhere,
          dueDate: { not: null },
        },
        orderBy: { dueDate: 'asc' },
        take: 5,
        include: taskListInclude,
      }),
    ]);

    // カウントも並列取得
    const [myTasksCount, upcomingCount, overdueCount, withDueDateCount] = await Promise.all([
      prisma.task.count({ where: baseWhere }),
      prisma.task.count({ where: { ...baseWhere, dueDate: { gte: todayStart, lte: threeDaysLater } } }),
      prisma.task.count({ where: { ...baseWhere, dueDate: { lt: todayStart } } }),
      prisma.task.count({ where: { ...baseWhere, dueDate: { not: null } } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        myTasks: { count: myTasksCount, items: myTasks.map(formatTaskListItem) },
        upcoming: { count: upcomingCount, items: upcomingTasks.map(formatTaskListItem) },
        overdue: { count: overdueCount, items: overdueTasks.map(formatTaskListItem) },
        withDueDate: { count: withDueDateCount, items: withDueDateTasks.map(formatTaskListItem) },
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
