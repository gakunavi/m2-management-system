import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

// ============================================
// GET /api/v1/reminders
// ログインユーザーに割り当てられた未完了リマインダー一覧
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { searchParams } = request.nextUrl;
    const includeCompleted = searchParams.get('includeCompleted') === 'true';

    const where = {
      assignedTo: user.id,
      ...(includeCompleted ? {} : { isCompleted: false }),
    };

    const reminders = await prisma.projectReminder.findMany({
      where,
      include: {
        project: {
          select: {
            id: true,
            projectNo: true,
            customer: { select: { customerName: true } },
          },
        },
        creator: { select: { id: true, userName: true } },
      },
      orderBy: { reminderDate: 'asc' },
      take: 50,
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const data = reminders.map((r) => {
      const rDate = new Date(r.reminderDate);
      rDate.setHours(0, 0, 0, 0);
      const isOverdue = rDate < today && !r.isCompleted;
      const isDueToday = rDate.getTime() === today.getTime() && !r.isCompleted;

      return {
        id: r.id,
        projectId: r.projectId,
        projectNo: r.project.projectNo,
        customerName: r.project.customer?.customerName ?? null,
        reminderDate: r.reminderDate.toISOString().split('T')[0],
        title: r.title,
        description: r.description,
        isCompleted: r.isCompleted,
        isOverdue,
        isDueToday,
        creator: r.creator,
      };
    });

    const overdueCount = data.filter((r) => r.isOverdue).length;
    const dueTodayCount = data.filter((r) => r.isDueToday).length;

    return NextResponse.json({
      success: true,
      data,
      meta: { total: data.length, overdueCount, dueTodayCount },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
