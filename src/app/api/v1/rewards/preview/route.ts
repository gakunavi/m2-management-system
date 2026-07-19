import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { requireInternalUser } from '@/lib/authz';
import { getCurrentMonth } from '@/lib/revenue-helpers';
import { getRewardEntriesForPeriod } from '@/lib/reward-helpers';
import type { RewardPreviewEntry, RewardPreviewResponse } from '@/types/reward';

// ============================================
// GET /api/v1/rewards/preview?businessId=&partnerId=&month=
// ============================================
// 内部報酬集計画面のドリルダウン: 1代理店・1対象月ぶんの明細行。

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();
    requireInternalUser(session);

    const { searchParams } = request.nextUrl;
    const businessIdParam = searchParams.get('businessId');
    const partnerIdParam = searchParams.get('partnerId');
    if (!businessIdParam || !partnerIdParam) {
      throw ApiError.badRequest('事業ID・代理店IDが必要です');
    }
    const businessId = parseInt(businessIdParam, 10);
    const partnerId = parseInt(partnerIdParam, 10);
    if (isNaN(businessId) || isNaN(partnerId)) throw ApiError.badRequest('不正なIDです');

    const month = searchParams.get('month') || getCurrentMonth();

    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { id: true, partnerName: true },
    });
    if (!partner) throw ApiError.notFound('代理店が見つかりません');

    const allEntries = await getRewardEntriesForPeriod(prisma, businessId, month, month);
    const entries = allEntries.filter((e) => e.partnerId === partnerId);

    const sourcePartnerIds = Array.from(
      new Set(entries.map((e) => e.sourcePartnerId).filter((id): id is number => id != null)),
    );
    const sourcePartners = sourcePartnerIds.length
      ? await prisma.partner.findMany({ where: { id: { in: sourcePartnerIds } }, select: { id: true, partnerName: true } })
      : [];
    const sourcePartnerMap = new Map(sourcePartners.map((p) => [p.id, p.partnerName]));

    const previewEntries: RewardPreviewEntry[] = entries
      .map((e) => ({
        projectId: e.projectId,
        projectNo: e.projectNo,
        customerName: e.customerName,
        rewardKind: e.rewardKind,
        entryType: e.entryType,
        sourcePartnerId: e.sourcePartnerId,
        sourcePartnerName: e.sourcePartnerId != null ? sourcePartnerMap.get(e.sourcePartnerId) ?? null : null,
        baseAmount: e.baseAmount,
        rewardType: e.rewardType,
        rate: e.rate,
        rewardAmount: e.rewardAmount,
        sourceMonth: e.sourceMonth,
        paymentMonth: e.paymentMonth,
      }))
      .sort((a, b) => a.projectNo.localeCompare(b.projectNo));

    const directTotal = previewEntries.filter((e) => e.entryType === 'direct').reduce((s, e) => s + e.rewardAmount, 0);
    const indirectTotal = previewEntries.filter((e) => e.entryType === 'indirect').reduce((s, e) => s + e.rewardAmount, 0);

    const response: RewardPreviewResponse = {
      businessId,
      partnerId,
      partnerName: partner.partnerName,
      month,
      entries: previewEntries,
      directTotal,
      indirectTotal,
      total: directTotal + indirectTotal,
    };

    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    return handleApiError(error);
  }
}
