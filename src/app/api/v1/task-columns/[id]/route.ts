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

const patchSchema = z.object({
  name: z.string().min(1, 'カラム名は必須です').max(100).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, '正しいカラーコードを入力してください')
    .optional()
    .nullable(),
  sortOrder: z.number().int().min(0).optional(),
});

// ============================================
// PATCH /api/v1/task-columns/[id]
// カラム名/色/sortOrder更新
// ============================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (user.role === 'partner_admin' || user.role === 'partner_staff') {
      throw ApiError.forbidden();
    }
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id } = await params;
    const columnId = parseInt(id, 10);
    if (isNaN(columnId)) throw ApiError.badRequest('不正なIDです');

    const existing = await prisma.taskColumn.findUnique({ where: { id: columnId } });
    if (!existing) throw ApiError.notFound('カラムが見つかりません');

    const body = await request.json();
    const patch = patchSchema.parse(body);

    const updateData: Record<string, unknown> = {};
    if (patch.name !== undefined) updateData.name = patch.name;
    if (patch.color !== undefined) updateData.color = patch.color;
    if (patch.sortOrder !== undefined) updateData.sortOrder = patch.sortOrder;

    const updated = await prisma.taskColumn.update({
      where: { id: columnId },
      data: updateData,
      include: {
        _count: { select: { tasks: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        color: updated.color,
        sortOrder: updated.sortOrder,
        scope: updated.scope,
        businessId: updated.businessId,
        boardId: updated.boardId,
        createdById: updated.createdById,
        taskCount: updated._count.tasks,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// DELETE /api/v1/task-columns/[id]
// カラム削除（そのカラムのタスクは columnId = null に）
// ============================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (user.role === 'partner_admin' || user.role === 'partner_staff') {
      throw ApiError.forbidden();
    }
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id } = await params;
    const columnId = parseInt(id, 10);
    if (isNaN(columnId)) throw ApiError.badRequest('不正なIDです');

    const existing = await prisma.taskColumn.findUnique({ where: { id: columnId } });
    if (!existing) throw ApiError.notFound('カラムが見つかりません');

    // トランザクション: タスクの columnId を null にしてからカラム削除
    await prisma.$transaction([
      prisma.task.updateMany({
        where: { columnId },
        data: { columnId: null },
      }),
      prisma.taskColumn.delete({ where: { id: columnId } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
