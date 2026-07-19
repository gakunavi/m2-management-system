import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { requireInternalUser } from '@/lib/authz';
import { inheritBusinessHierarchyOnLink } from '@/lib/business-partner-hierarchy';
import { serializeRewardLinkFields, rewardLinkInputSchema } from '@/lib/reward-link-serializer';
import { parseRewardSlots } from '@/lib/reward-slots';

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
    requireInternalUser(session);

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
        business: { select: { businessName: true, businessCode: true, businessConfig: true } },
        businessParent: { select: { id: true, partnerCode: true, partnerName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: links.map((l) => {
        const bizConfig = l.business.businessConfig as { rewardConfig?: { defaults?: unknown } } | null;
        return {
          id: l.id,
          partnerId: l.partnerId,
          businessId: l.businessId,
          businessName: l.business.businessName,
          businessCode: l.business.businessCode,
          linkStatus: l.linkStatus,
          ...serializeRewardLinkFields(l),
          businessDefaultRewardSlots: parseRewardSlots(bizConfig?.rewardConfig?.defaults),
          contactPerson: l.contactPerson,
          linkCustomData: l.linkCustomData,
          businessTier: l.businessTier,
          businessTierNumber: l.businessTierNumber,
          businessParentId: l.businessParentId,
          businessParentName: l.businessParent?.partnerName ?? null,
          businessParentCode: l.businessParent?.partnerCode ?? null,
          createdAt: l.createdAt.toISOString(),
          updatedAt: l.updatedAt.toISOString(),
        };
      }),
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
  ...rewardLinkInputSchema,
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
    requireInternalUser(session);

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

    const created = await prisma.$transaction(async (tx) => {
      const link = await tx.partnerBusinessLink.create({
        data: {
          partnerId,
          businessId: data.businessId,
          linkStatus: data.linkStatus,
          ...(data.rewardSlots != null ? { rewardSlots: data.rewardSlots as Prisma.InputJsonValue } : {}),
          ...(data.paymentTiming != null ? { paymentTiming: data.paymentTiming } : {}),
          ...(data.closingDay != null ? { closingDay: data.closingDay } : {}),
          contactPerson: data.contactPerson ?? undefined,
          linkCustomData: data.linkCustomData as Prisma.InputJsonValue,
        },
      });
      // 再発防止: グローバル親が同事業に階層設定済みなら事業別階層を継承
      await inheritBusinessHierarchyOnLink(tx, partnerId, data.businessId);
      return link;
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
        ...serializeRewardLinkFields(linkWithBusiness!),
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
