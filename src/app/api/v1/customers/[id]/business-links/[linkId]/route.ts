import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

// ============================================
// PATCH /api/v1/customers/:id/business-links/:linkId
// ============================================

const updateLinkSchema = z.object({
  linkStatus: z.string().max(20).optional(),
  linkCustomData: z.record(z.unknown()).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id, linkId } = await params;
    const customerId = parseInt(id, 10);
    const linkIdNum = parseInt(linkId, 10);
    if (isNaN(customerId) || isNaN(linkIdNum)) throw ApiError.notFound('事業リンクが見つかりません');

    const existing = await prisma.customerBusinessLink.findFirst({
      where: { id: linkIdNum, customerId },
    });
    if (!existing) throw ApiError.notFound('事業リンクが見つかりません');

    const body = await request.json();
    const data = updateLinkSchema.parse(body);

    await prisma.customerBusinessLink.update({
      where: { id: linkIdNum },
      data: {
        ...(data.linkStatus !== undefined ? { linkStatus: data.linkStatus } : {}),
        ...(data.linkCustomData !== undefined
          ? { linkCustomData: data.linkCustomData as Prisma.InputJsonValue }
          : {}),
      },
    });

    const updated = await prisma.customerBusinessLink.findUnique({
      where: { id: linkIdNum },
      include: { business: { select: { businessName: true, businessCode: true } } },
    }) as Prisma.CustomerBusinessLinkGetPayload<{
      include: { business: { select: { businessName: true; businessCode: true } } };
    }>;

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        customerId: updated.customerId,
        businessId: updated.businessId,
        businessName: updated.business.businessName,
        businessCode: updated.business.businessCode,
        linkStatus: updated.linkStatus,
        linkCustomData: updated.linkCustomData,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// DELETE /api/v1/customers/:id/business-links/:linkId
// ============================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id, linkId } = await params;
    const customerId = parseInt(id, 10);
    const linkIdNum = parseInt(linkId, 10);
    if (isNaN(customerId) || isNaN(linkIdNum)) throw ApiError.notFound('事業リンクが見つかりません');

    const existing = await prisma.customerBusinessLink.findFirst({
      where: { id: linkIdNum, customerId },
    });
    if (!existing) throw ApiError.notFound('事業リンクが見つかりません');

    await prisma.customerBusinessLink.delete({ where: { id: linkIdNum } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
