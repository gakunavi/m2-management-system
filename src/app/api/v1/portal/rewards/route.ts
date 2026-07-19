import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { getCurrentMonth, getBusinessPartnerScope } from '@/lib/revenue-helpers';
import { getRewardEntriesForPeriod } from '@/lib/reward-helpers';
import type { PortalRewardResponse } from '@/types/reward';

export const dynamic = 'force-dynamic';

// ============================================
// GET /api/v1/portal/rewards?businessId=
// ============================================
// 代理店ポータル: 自分（配下含む）の報酬を当月ライブ＋過去確定分で表示する。
//
// スコープ:
// - partner_admin: 自分＋配下代理店（getBusinessPartnerScope）
//   下位代理店の成績が見えるため、既存の partner-ranking と同様に admin 限定
// - partner_staff: 自分の代理店のみ（配下は見せない）

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string; partnerId: number | null };
    if (!['partner_admin', 'partner_staff'].includes(user.role)) throw ApiError.forbidden();
    if (!user.partnerId) throw ApiError.forbidden('代理店情報が設定されていません');

    const { searchParams } = request.nextUrl;
    const businessIdParam = searchParams.get('businessId');
    if (!businessIdParam) throw ApiError.badRequest('事業IDが必要です');
    const businessId = parseInt(businessIdParam, 10);
    if (isNaN(businessId)) throw ApiError.badRequest('不正な事業IDです');

    const scopeIds =
      user.role === 'partner_admin'
        ? await getBusinessPartnerScope(prisma, user.partnerId, businessId)
        : [user.partnerId];

    const month = getCurrentMonth();

    // 当月ライブ（未締めの計算値。事業に報酬設定が無い場合は空扱い）
    const allEntries = await getRewardEntriesForPeriod(prisma, businessId, month, month);
    const entries = allEntries.filter((e) => scopeIds.includes(e.partnerId));

    // 受取代理店(partnerId)だけでなく、間接報酬の経由元(sourcePartnerId)の名前解決にも使うため両方集める
    const partnerIds = Array.from(
      new Set([
        ...entries.map((e) => e.partnerId),
        ...entries.map((e) => e.sourcePartnerId).filter((id): id is number => id != null),
      ]),
    );
    const partners = partnerIds.length
      ? await prisma.partner.findMany({ where: { id: { in: partnerIds } }, select: { id: true, partnerName: true } })
      : [];
    const partnerNameMap = new Map(partners.map((p) => [p.id, p.partnerName]));

    const liveDirectTotal = entries.filter((e) => e.entryType === 'direct').reduce((s, e) => s + e.rewardAmount, 0);
    const liveIndirectTotal = entries.filter((e) => e.entryType === 'indirect').reduce((s, e) => s + e.rewardAmount, 0);

    // 過去確定分（スコープ内の代理店ぶん、対象月の新しい順）
    const statements = await prisma.rewardStatement.findMany({
      where: { businessId, partnerId: { in: scopeIds } },
      orderBy: [{ periodMonth: 'desc' }, { partnerId: 'asc' }],
      include: { partner: { select: { partnerName: true } } },
    });

    const response: PortalRewardResponse = {
      businessId,
      month,
      live: {
        directTotal: liveDirectTotal,
        indirectTotal: liveIndirectTotal,
        total: liveDirectTotal + liveIndirectTotal,
        entries: entries.map((e) => ({
          projectNo: e.projectNo,
          customerName: e.customerName,
          partnerName: partnerNameMap.get(e.partnerId) ?? '',
          rewardKind: e.rewardKind,
          entryType: e.entryType,
          sourcePartnerName: e.sourcePartnerId != null ? (partnerNameMap.get(e.sourcePartnerId) ?? null) : null,
          rewardAmount: e.rewardAmount,
        })),
      },
      confirmedStatements: statements.map((s) => ({
        id: s.id,
        partnerName: s.partner.partnerName,
        periodMonth: s.periodMonth,
        totalDirect: s.totalDirect.toNumber(),
        totalIndirect: s.totalIndirect.toNumber(),
        grandTotal: s.grandTotal.toNumber(),
        confirmedAt: s.confirmedAt?.toISOString() ?? null,
      })),
    };

    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    return handleApiError(error);
  }
}
