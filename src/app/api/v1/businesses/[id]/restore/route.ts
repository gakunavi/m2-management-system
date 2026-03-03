import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { formatBusiness } from '@/lib/format-business';

// ============================================
// PATCH /api/v1/businesses/:id/restore
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
    const businessId = parseInt(id, 10);
    if (isNaN(businessId)) throw ApiError.notFound('事業が見つかりません');

    const current = await prisma.business.findUnique({
      where: { id: businessId },
      select: { businessIsActive: true },
    });
    if (!current) throw ApiError.notFound('事業が見つかりません');
    if (current.businessIsActive) {
      throw ApiError.conflict('既に有効な事業です');
    }

    const restored = await prisma.business.update({
      where: { id: businessId },
      data: {
        businessIsActive: true,
        version: { increment: 1 },
        updatedBy: user.id,
      },
    });

    return NextResponse.json({ success: true, data: formatBusiness(restored) });
  } catch (error) {
    return handleApiError(error);
  }
}
