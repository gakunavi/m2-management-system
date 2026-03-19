import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

const reorderTabsSchema = z.object({
  orderedBoardIds: z.array(z.number().int().positive()),
});

// ============================================
// PATCH /api/v1/task-boards/reorder-tabs
// ユーザーのボードタブ表示順を更新
// ============================================

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const body = await request.json();
    const { orderedBoardIds } = reorderTabsSchema.parse(body);

    // トランザクションで一括更新
    await prisma.$transaction(
      orderedBoardIds.map((boardId, index) =>
        prisma.taskBoardMember.update({
          where: {
            boardId_userId: { boardId, userId: user.id },
          },
          data: { tabOrder: index },
        }),
      ),
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
