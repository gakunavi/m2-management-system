import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

// ============================================
// PATCH /api/v1/qa/items/[id]/publish
// ============================================

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id } = await params;
    const itemId = parseInt(id, 10);
    if (isNaN(itemId)) throw ApiError.notFound('QAアイテムが見つかりません');

    const current = await prisma.qaItem.findUnique({
      where: { id: itemId },
      select: { id: true, itemStatus: true },
    });
    if (!current) throw ApiError.notFound('QAアイテムが見つかりません');

    const isDraft = current.itemStatus === 'draft';
    const newStatus = isDraft ? 'published' : 'draft';
    const newPublishedAt = isDraft ? new Date() : null;

    const updated = await prisma.qaItem.update({
      where: { id: itemId },
      data: {
        itemStatus: newStatus,
        itemPublishedAt: newPublishedAt,
        updatedBy: user.id,
      },
      select: {
        id: true,
        itemStatus: true,
        itemPublishedAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        itemStatus: updated.itemStatus,
        itemPublishedAt: updated.itemPublishedAt ? updated.itemPublishedAt.toISOString() : null,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
