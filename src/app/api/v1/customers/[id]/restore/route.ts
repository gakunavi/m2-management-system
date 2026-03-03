import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

// ============================================
// PATCH /api/v1/customers/:id/restore
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
    const customerId = parseInt(id, 10);
    if (isNaN(customerId)) throw ApiError.notFound('顧客が見つかりません');

    const current = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { customerIsActive: true },
    });
    if (!current) throw ApiError.notFound('顧客が見つかりません');
    if (current.customerIsActive) {
      throw ApiError.conflict('既に有効な顧客です');
    }

    const restored = await prisma.customer.update({
      where: { id: customerId },
      data: {
        customerIsActive: true,
        version: { increment: 1 },
        updatedBy: user.id,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...restored,
        customerCapital: restored.customerCapital !== null ? Number(restored.customerCapital) : null,
        customerEstablishedDate: restored.customerEstablishedDate?.toISOString().split('T')[0] ?? null,
        createdAt: restored.createdAt.toISOString(),
        updatedAt: restored.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
