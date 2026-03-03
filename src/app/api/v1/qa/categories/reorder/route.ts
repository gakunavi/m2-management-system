import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

// ============================================
// PATCH /api/v1/qa/categories/reorder
// ============================================

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (user.role !== 'admin') throw ApiError.forbidden();

    const body = await request.json();
    const { orderedIds } = body;

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      throw ApiError.badRequest('orderedIds は必須です');
    }

    await prisma.$transaction(
      orderedIds.map((id: number, index: number) =>
        prisma.qaCategory.update({
          where: { id },
          data: { categorySortOrder: index },
        }),
      ),
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
