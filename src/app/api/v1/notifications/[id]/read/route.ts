import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number };
    const { id } = await params;
    const notificationId = parseInt(id, 10);
    if (isNaN(notificationId)) throw ApiError.notFound('通知が見つかりません');

    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
      select: { userId: true },
    });
    if (!notification) throw ApiError.notFound('通知が見つかりません');
    if (notification.userId !== user.id) throw ApiError.forbidden();

    await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
