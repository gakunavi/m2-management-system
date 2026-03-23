import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

// ============================================
// GET /api/v1/partners/candidates/for-business-link
// 事業に未紐付けの代理店候補を返す
// ?businessId=1&search=xxx
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const { searchParams } = request.nextUrl;
    const businessId = searchParams.get('businessId');
    const search = searchParams.get('search') ?? '';

    if (!businessId) throw ApiError.badRequest('businessId は必須です');
    const bizId = parseInt(businessId, 10);
    if (isNaN(bizId)) throw ApiError.badRequest('businessId が不正です');

    // この事業に既に紐付いている代理店IDを取得
    const existingLinks = await prisma.partnerBusinessLink.findMany({
      where: { businessId: bizId },
      select: { partnerId: true },
    });
    const linkedPartnerIds = existingLinks.map((l) => l.partnerId);

    // 未紐付け＆有効な代理店を検索
    const candidates = await prisma.partner.findMany({
      where: {
        partnerIsActive: true,
        ...(linkedPartnerIds.length > 0 ? { id: { notIn: linkedPartnerIds } } : {}),
        ...(search
          ? {
              OR: [
                { partnerName: { contains: search, mode: 'insensitive' as const } },
                { partnerCode: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: [{ partnerCode: 'asc' }],
      take: 50,
      select: {
        id: true,
        partnerCode: true,
        partnerName: true,
        partnerTier: true,
        partnerTierNumber: true,
      },
    });

    return NextResponse.json({ success: true, data: candidates });
  } catch (error) {
    return handleApiError(error);
  }
}
