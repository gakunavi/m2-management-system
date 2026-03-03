import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

const reorderSchema = z.object({
  orderedIds: z.array(z.number().int()),
});

// ============================================
// PATCH /api/v1/businesses/:id/status-definitions/reorder
// ============================================
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id } = await params;
    const businessId = parseInt(id, 10);
    if (isNaN(businessId)) throw ApiError.notFound();

    const body = await request.json();
    const { orderedIds } = reorderSchema.parse(body);

    await prisma.$transaction(
      orderedIds.map((statusId, index) =>
        prisma.businessStatusDefinition.updateMany({
          where: { id: statusId, businessId },
          data: { statusSortOrder: index },
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
