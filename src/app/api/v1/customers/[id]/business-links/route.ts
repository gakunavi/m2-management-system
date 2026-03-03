import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

// ============================================
// GET /api/v1/customers/:id/business-links
// ============================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const { id } = await params;
    const customerId = parseInt(id, 10);
    if (isNaN(customerId)) throw ApiError.notFound('顧客が見つかりません');

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) throw ApiError.notFound('顧客が見つかりません');

    const links = await prisma.customerBusinessLink.findMany({
      where: { customerId },
      include: {
        business: { select: { businessName: true, businessCode: true } },
      },
      orderBy: { createdAt: 'asc' },
    }) as Array<Prisma.CustomerBusinessLinkGetPayload<{
      include: { business: { select: { businessName: true; businessCode: true } } };
    }>>;

    return NextResponse.json({
      success: true,
      data: links.map((l) => ({
        id: l.id,
        customerId: l.customerId,
        businessId: l.businessId,
        businessName: l.business.businessName,
        businessCode: l.business.businessCode,
        linkStatus: l.linkStatus,
        linkCustomData: l.linkCustomData,
        createdAt: l.createdAt.toISOString(),
        updatedAt: l.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// POST /api/v1/customers/:id/business-links
// ============================================

const createLinkSchema = z.object({
  businessId: z.number().int().positive(),
  linkStatus: z.string().max(20).default('active'),
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
    const customerId = parseInt(id, 10);
    if (isNaN(customerId)) throw ApiError.notFound('顧客が見つかりません');

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) throw ApiError.notFound('顧客が見つかりません');

    const body = await request.json();
    const data = createLinkSchema.parse(body);

    const created = await prisma.customerBusinessLink.create({
      data: {
        customerId,
        businessId: data.businessId,
        linkStatus: data.linkStatus,
        linkCustomData: data.linkCustomData as Prisma.InputJsonValue,
      },
    });

    const linkWithBusiness = await prisma.customerBusinessLink.findUnique({
      where: { id: created.id },
      include: { business: { select: { businessName: true, businessCode: true } } },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: linkWithBusiness!.id,
        customerId: linkWithBusiness!.customerId,
        businessId: linkWithBusiness!.businessId,
        businessName: linkWithBusiness!.business.businessName,
        businessCode: linkWithBusiness!.business.businessCode,
        linkStatus: linkWithBusiness!.linkStatus,
        linkCustomData: linkWithBusiness!.linkCustomData,
        createdAt: linkWithBusiness!.createdAt.toISOString(),
        updatedAt: linkWithBusiness!.updatedAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
