import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// ============================================
// バリデーションスキーマ
// ============================================

const reorderItemSchema = z.object({
  id: z.number().int().positive(),
  sortOrder: z.number().int().min(0),
});

const reorderSchema = z.object({
  items: z.array(reorderItemSchema).min(1, '並び替え対象が必要です'),
});

// ============================================
// PATCH /api/v1/task-columns/reorder
// カラムの一括sortOrder更新
// ============================================

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (user.role === 'partner_admin' || user.role === 'partner_staff') {
      throw ApiError.forbidden();
    }
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const body = await request.json();
    const { items } = reorderSchema.parse(body);

    await prisma.$transaction(
      items.map((item) =>
        prisma.taskColumn.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
