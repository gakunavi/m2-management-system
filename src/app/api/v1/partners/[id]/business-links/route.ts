import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

// ============================================
// GET /api/v1/partners/:id/business-links
// ============================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const { id } = await params;
    const partnerId = parseInt(id, 10);
    if (isNaN(partnerId)) throw ApiError.notFound('代理店が見つかりません');

    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { id: true },
    });
    if (!partner) throw ApiError.notFound('代理店が見つかりません');

    const links = await prisma.partnerBusinessLink.findMany({
      where: { partnerId },
      include: {
        business: { select: { businessName: true, businessCode: true } },
        businessParent: { select: { id: true, partnerCode: true, partnerName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: links.map((l) => ({
        id: l.id,
        partnerId: l.partnerId,
        businessId: l.businessId,
        businessName: l.business.businessName,
        businessCode: l.business.businessCode,
        linkStatus: l.linkStatus,
        commissionRate: l.commissionRate != null ? Number(l.commissionRate) : null,
        contactPerson: l.contactPerson,
        linkCustomData: l.linkCustomData,
        businessTier: l.businessTier,
        businessTierNumber: l.businessTierNumber,
        businessParentId: l.businessParentId,
        businessParentName: l.businessParent?.partnerName ?? null,
        businessParentCode: l.businessParent?.partnerCode ?? null,
        createdAt: l.createdAt.toISOString(),
        updatedAt: l.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// POST /api/v1/partners/:id/business-links
// ============================================

const createLinkSchema = z.object({
  businessId: z.number().int().positive(),
  linkStatus: z.string().max(20).default('active'),
  commissionRate: z.number().min(0).max(100).nullable().optional(),
  contactPerson: z.string().max(100).nullable().optional(),
  linkCustomData: z.record(z.unknown()).default({}),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id } = await params;
    const partnerId = parseInt(id, 10);
    if (isNaN(partnerId)) throw ApiError.notFound('代理店が見つかりません');

    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { id: true },
    });
    if (!partner) throw ApiError.notFound('代理店が見つかりません');

    const body = await request.json();
    const data = createLinkSchema.parse(body);

    const created = await prisma.partnerBusinessLink.create({
      data: {
        partnerId,
        businessId: data.businessId,
        linkStatus: data.linkStatus,
        commissionRate: data.commissionRate ?? undefined,
        contactPerson: data.contactPerson ?? undefined,
        linkCustomData: data.linkCustomData as Prisma.InputJsonValue,
      },
    });

    const linkWithBusiness = await prisma.partnerBusinessLink.findUnique({
      where: { id: created.id },
      include: { business: { select: { businessName: true, businessCode: true } } },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: linkWithBusiness!.id,
        partnerId: linkWithBusiness!.partnerId,
        businessId: linkWithBusiness!.businessId,
        businessName: linkWithBusiness!.business.businessName,
        businessCode: linkWithBusiness!.business.businessCode,
        linkStatus: linkWithBusiness!.linkStatus,
        commissionRate: linkWithBusiness!.commissionRate != null ? Number(linkWithBusiness!.commissionRate) : null,
        contactPerson: linkWithBusiness!.contactPerson,
        linkCustomData: linkWithBusiness!.linkCustomData,
        createdAt: linkWithBusiness!.createdAt.toISOString(),
        updatedAt: linkWithBusiness!.updatedAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
