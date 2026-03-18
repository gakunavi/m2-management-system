import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { formatTaskListItem } from '@/lib/task-helpers';

export const dynamic = 'force-dynamic';

const taskListInclude = {
  assignee: { select: { userName: true } },
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
    const sevenDaysLater = new Date(todayStart);
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

    const baseWhere = {
      assigneeId: user.id,
      isArchived: false,
      parentTaskId: null,
    };

    // Summary counts
    const [todoCount, inProgressCount, overdueCount, totalCount] = await Promise.all([
      prisma.task.count({
        where: { ...baseWhere, status: 'todo' },
      }),
      prisma.task.count({
        where: { ...baseWhere, status: 'in_progress' },
      }),
      prisma.task.count({
        where: {
          ...baseWhere,
          status: { notIn: ['done'] },
          dueDate: { lt: todayStart },
        },
      }),
      prisma.task.count({
        where: {
          ...baseWhere,
          status: { notIn: ['done'] },
        },
      }),
    ]);

    // Upcoming tasks (due within 7 days, not done, ordered by dueDate asc)
    const upcomingTasks = await prisma.task.findMany({
      where: {
        ...baseWhere,
        status: { notIn: ['done'] },
        dueDate: {
          gte: todayStart,
          lte: sevenDaysLater,
        },
      },
      orderBy: { dueDate: 'asc' },
      take: 5,
      include: taskListInclude,
    });

    // Overdue tasks (past due, not done, ordered by dueDate desc)
    const overdueTasks = await prisma.task.findMany({
      where: {
        ...baseWhere,
        status: { notIn: ['done'] },
        dueDate: { lt: todayStart },
      },
      orderBy: { dueDate: 'desc' },
      take: 5,
      include: taskListInclude,
    });

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          todo: todoCount,
          inProgress: inProgressCount,
          overdue: overdueCount,
          total: totalCount,
        },
        upcoming: upcomingTasks.map(formatTaskListItem),
        overdue: overdueTasks.map(formatTaskListItem),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
