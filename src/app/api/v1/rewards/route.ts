import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { requireInternalUser } from '@/lib/authz';
import { getCurrentMonth } from '@/lib/revenue-helpers';
import { getRewardEntriesForPeriod } from '@/lib/reward-helpers';
import type { RewardPartnerSummary, RewardSummaryResponse } from '@/types/reward';

// ============================================
// GET /api/v1/rewards?businessId=&month=
// ============================================
// 対象月（支払い対象月）の代理店別 直紹介/間接/合計 の内部集計。
// 締め（確定）前のライブ計算のみを扱う（Phase 4 で締め機能を追加）。

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();
    requireInternalUser(session);

    const { searchParams } = request.nextUrl;
    const businessIdParam = searchParams.get('businessId');
    if (!businessIdParam) throw ApiError.badRequest('事業IDが必要です');
    const businessId = parseInt(businessIdParam, 10);
    if (isNaN(businessId)) throw ApiError.badRequest('不正な事業IDです');

    const month = searchParams.get('month') || getCurrentMonth();

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, businessName: true },
    });
    if (!business) throw ApiError.notFound('事業が見つかりません');

    const entries = await getRewardEntriesForPeriod(prisma, businessId, month, month);

    const partnerIds = Array.from(new Set(entries.map((e) => e.partnerId)));
    const partners = await prisma.partner.findMany({
      where: { id: { in: partnerIds } },
      select: { id: true, partnerCode: true, partnerName: true },
    });
    const partnerMap = new Map(partners.map((p) => [p.id, p]));

    const summaryMap = new Map<number, RewardPartnerSummary>();
    for (const e of entries) {
      const existing = summaryMap.get(e.partnerId);
      const partner = partnerMap.get(e.partnerId);
      const summary: RewardPartnerSummary = existing ?? {
        partnerId: e.partnerId,
        partnerCode: partner?.partnerCode ?? '',
        partnerName: partner?.partnerName ?? '',
        directTotal: 0,
        indirectTotal: 0,
        total: 0,
        entryCount: 0,
      };
      if (e.entryType === 'direct') summary.directTotal += e.rewardAmount;
      else summary.indirectTotal += e.rewardAmount;
      summary.total += e.rewardAmount;
      summary.entryCount += 1;
      summaryMap.set(e.partnerId, summary);
    }

    const partnerSummaries = Array.from(summaryMap.values()).sort((a, b) => b.total - a.total);

    const grandTotal = partnerSummaries.reduce(
      (acc, p) => ({
        directTotal: acc.directTotal + p.directTotal,
        indirectTotal: acc.indirectTotal + p.indirectTotal,
        total: acc.total + p.total,
      }),
      { directTotal: 0, indirectTotal: 0, total: 0 },
    );

    const response: RewardSummaryResponse = {
      businessId,
      businessName: business.businessName,
      month,
      partners: partnerSummaries,
      grandTotal,
    };

    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    return handleApiError(error);
  }
}
