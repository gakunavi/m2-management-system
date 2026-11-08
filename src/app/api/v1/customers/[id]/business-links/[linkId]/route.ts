import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { notifyCustomerLinkChangedToMl } from '@/lib/ml-scope';
import { userActor } from '@/lib/update-actor';

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

    // 事業別カスタム項目（linkCustomData）も ML が読む値なので知らせる。
    // linkStatus を落としたときは「ML から見えなくなった」ことを知らせる
    await notifyCustomerLinkChangedToMl(prisma, userActor(user), {
      businessId: existing.businessId,
      customerId,
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

    // リンクが消えると ML からは 404 になる。notifyCustomerChangedToMl は
    // 「リンクのある顧客」しか通さないので、事業IDで判定する専用の入口を使う
    await notifyCustomerLinkChangedToMl(prisma, userActor(user), {
      businessId: existing.businessId,
      customerId,
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
