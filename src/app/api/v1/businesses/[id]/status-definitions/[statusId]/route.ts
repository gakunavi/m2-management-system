import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

const updateSchema = z.object({
  statusLabel: z.string().min(1).max(100).optional(),
  statusPriority: z.number().int().min(0).optional(),
  statusColor: z.string().max(20).optional().nullable(),
  statusIsFinal: z.boolean().optional(),
  statusIsLost: z.boolean().optional(),
  statusIsActive: z.boolean().optional(),
});

// ============================================
// PATCH /api/v1/businesses/:id/status-definitions/:statusId
// ============================================
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; statusId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id, statusId } = await params;
    const businessId = parseInt(id, 10);
    const statusDefId = parseInt(statusId, 10);
    if (isNaN(businessId) || isNaN(statusDefId)) throw ApiError.notFound();

    const current = await prisma.businessStatusDefinition.findFirst({
      where: { id: statusDefId, businessId },
    });
    if (!current) throw ApiError.notFound('ステータス定義が見つかりません');

    const body = await request.json();
    // statusCode は更新不可
    const { statusCode: _, ...rest } = body; // eslint-disable-line @typescript-eslint/no-unused-vars
    const data = updateSchema.parse(rest);

    // statusIsFinal / statusIsLost は複数設定可能（制約なし）
    const updated = await prisma.businessStatusDefinition.update({
      where: { id: statusDefId },
      data,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// DELETE /api/v1/businesses/:id/status-definitions/:statusId
// ============================================
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; statusId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id, statusId } = await params;
    const businessId = parseInt(id, 10);
    const statusDefId = parseInt(statusId, 10);
    if (isNaN(businessId) || isNaN(statusDefId)) throw ApiError.notFound();

    const current = await prisma.businessStatusDefinition.findFirst({
      where: { id: statusDefId, businessId },
    });
    if (!current) throw ApiError.notFound('ステータス定義が見つかりません');

    // 使用中の案件があれば削除不可
    const usedCount = await prisma.project.count({
      where: {
        businessId,
        projectSalesStatus: current.statusCode,
        projectIsActive: true,
      },
    });
    if (usedCount > 0) {
      throw ApiError.badRequest(
        `このステータスを使用中の案件が ${usedCount} 件あります。先に案件のステータスを変更してください。`
      );
    }

    await prisma.businessStatusDefinition.delete({
      where: { id: statusDefId },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
