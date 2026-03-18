import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// ============================================
// GET /api/v1/task-tags/suggest?q=xxx
// タグ名のサジェスト（インクリメンタルサーチ用）
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (user.role === 'partner_admin' || user.role === 'partner_staff') {
      throw ApiError.forbidden();
    }

    const userId = user.id;
    const q = request.nextUrl.searchParams.get('q') ?? '';

    if (q.length < 1) {
      return NextResponse.json({ success: true, data: [] });
    }

    const tags = await prisma.taskTag.findMany({
      where: {
        AND: [
          {
            OR: [
              { scope: 'shared' },
              { scope: 'personal', ownerId: userId },
            ],
          },
          { name: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        name: true,
        color: true,
        scope: true,
      },
      take: 20,
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ success: true, data: tags });
  } catch (error) {
    return handleApiError(error);
  }
}
