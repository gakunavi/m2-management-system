import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// ============================================
// GET /api/v1/ai/conversations — 会話一覧
// ============================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const conversations = await prisma.chatConversation.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        businessId: true,
        updatedAt: true,
        business: { select: { businessName: true } },
        _count: { select: { messages: true } },
      },
    });

    const data = conversations.map((c) => ({
      id: c.id,
      title: c.title,
      businessId: c.businessId,
      businessName: c.business?.businessName ?? null,
      updatedAt: c.updatedAt.toISOString(),
      messageCount: c._count.messages,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleApiError(error);
  }
}
