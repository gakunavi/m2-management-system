import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number };
    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const pageSize = Math.min(50, Math.max(0, parseInt(searchParams.get('pageSize') ?? '20', 10)));

    const where = { userId: user.id };

    const [notifications, total, unreadCount] = await Promise.all([
      pageSize > 0
        ? prisma.notification.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
          })
        : Promise.resolve([]),
      pageSize > 0 ? prisma.notification.count({ where }) : Promise.resolve(0),
      prisma.notification.count({ where: { ...where, isRead: false } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        notifications: notifications.map((n) => ({
          id: n.id,
          notificationType: n.notificationType,
          notificationTitle: n.notificationTitle,
          notificationMessage: n.notificationMessage,
          isRead: n.isRead,
          relatedEntity: n.relatedEntity,
          relatedEntityId: n.relatedEntityId,
          createdAt: n.createdAt.toISOString(),
        })),
        unreadCount,
        meta: {
          total,
          page,
          pageSize,
          totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
        },
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
