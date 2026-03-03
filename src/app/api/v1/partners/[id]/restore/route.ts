import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

// ============================================
// PATCH /api/v1/partners/:id/restore
// ============================================

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (user.role !== 'admin') throw ApiError.forbidden('管理者のみ復元できます');

    const { id } = await params;
    const partnerId = parseInt(id, 10);
    if (isNaN(partnerId)) throw ApiError.notFound('代理店が見つかりません');

    const current = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { partnerIsActive: true },
    });
    if (!current) throw ApiError.notFound('代理店が見つかりません');
    if (current.partnerIsActive) {
      throw ApiError.conflict('既に有効な代理店です');
    }

    const restored = await prisma.partner.update({
      where: { id: partnerId },
      data: {
        partnerIsActive: true,
        version: { increment: 1 },
        updatedBy: user.id,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...restored,
        partnerEstablishedDate: restored.partnerEstablishedDate?.toISOString().split('T')[0] ?? null,
        createdAt: restored.createdAt.toISOString(),
        updatedAt: restored.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
