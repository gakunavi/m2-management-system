import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

// ============================================
// GET /api/v1/partners/candidates
// 親代理店候補を取得（フォーム用）
// ?tier=1次代理店&search=xxx&exclude=5
// ?businessId=1&tier=1次代理店&search=xxx&exclude=5  ← 事業別
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const { searchParams } = request.nextUrl;
    const tier = searchParams.get('tier') ?? '';
    const search = searchParams.get('search') ?? '';
    const excludeId = searchParams.get('exclude');
    const businessId = searchParams.get('businessId');

    // 事業別候補検索
    if (businessId) {
      const bizId = parseInt(businessId, 10);
      if (isNaN(bizId)) throw ApiError.badRequest('businessId が不正です');

      const links = await prisma.partnerBusinessLink.findMany({
        where: {
          businessId: bizId,
          // tier 指定時はそれでフィルター、未指定時は階層設定済み（parentになれる）代理店のみ
          ...(tier ? { businessTier: tier } : { businessTier: { not: null } }),
          partner: {
            partnerIsActive: true,
            ...(search
              ? {
                  OR: [
                    { partnerName: { contains: search, mode: 'insensitive' as const } },
                    { partnerCode: { contains: search, mode: 'insensitive' as const } },
                  ],
                }
              : {}),
            ...(excludeId ? { id: { not: parseInt(excludeId, 10) } } : {}),
          },
        },
        include: {
          partner: {
            select: {
              id: true,
              partnerCode: true,
              partnerName: true,
              partnerTier: true,
              partnerTierNumber: true,
            },
          },
        },
        orderBy: [{ businessTierNumber: 'asc' }],
        take: 50,
      });

      const candidates = links.map((l) => ({
        id: l.partner.id,
        partnerCode: l.partner.partnerCode,
        partnerName: l.partner.partnerName,
        partnerTier: l.businessTier,
        partnerTierNumber: l.businessTierNumber,
      }));

      return NextResponse.json({ success: true, data: candidates });
    }

    // マスタ版候補検索（既存ロジック）
    const where = {
      partnerIsActive: true,
      ...(tier ? { partnerTier: tier } : {}),
      ...(search
        ? {
            OR: [
              { partnerName: { contains: search, mode: 'insensitive' as const } },
              { partnerCode: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(excludeId ? { id: { not: parseInt(excludeId, 10) } } : {}),
    };

    const candidates = await prisma.partner.findMany({
      where,
      orderBy: [{ partnerTierNumber: 'asc' }, { partnerCode: 'asc' }],
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
