import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

/**
 * POST /api/v1/push-subscriptions — デバイスのPush購読を登録
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number };
    const body = await request.json();

    const { endpoint, keys, userAgent } = body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      throw ApiError.badRequest('endpoint と keys (p256dh, auth) は必須です');
    }

    await prisma.pushSubscription.upsert({
      where: {
        userId_endpoint: { userId: user.id, endpoint },
      },
      update: {
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent ?? null,
      },
      create: {
        userId: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent ?? null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/v1/push-subscriptions — デバイスのPush購読を解除
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number };
    const body = await request.json();

    const { endpoint } = body;
    if (!endpoint) {
      throw ApiError.badRequest('endpoint は必須です');
    }

    await prisma.pushSubscription.deleteMany({
      where: { userId: user.id, endpoint },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
