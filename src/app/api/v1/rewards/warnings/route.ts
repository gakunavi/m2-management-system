import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { requireInternalUser } from '@/lib/authz';
import type { RewardConfirmationWarning } from '@/types/reward';

// ============================================
// GET /api/v1/rewards/warnings?businessId=
// ============================================
// 締め前の警告: 営業ステータスは「収益確定」対象(isRevenueConfirmed=true)なのに
// revenueConfirmedAt が未設定の案件を検出する。
//
// この状態の案件は報酬計算（getRewardEntriesForPeriod）から静かに除外される
// （revenueConfirmedAt が無ければショット/ストックとも対象外）。CSVインポートや
// DB直接操作、過去の不具合等でステータス変更PATCHを経由せず状態が作られると
// 発生しうる。一度その月を確定すると後から気づいても遡って反映できないため、
// 確定前にここで検出・警告する。月に依存しない（現在の状態のみを見る）。

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

    const flaggedStatuses = await prisma.businessStatusDefinition.findMany({
      where: { businessId, isRevenueConfirmed: true, statusIsActive: true },
      select: { statusCode: true, statusLabel: true },
    });
    const statusLabelMap = new Map(flaggedStatuses.map((s) => [s.statusCode, s.statusLabel]));
    const statusCodes = flaggedStatuses.map((s) => s.statusCode);

    if (statusCodes.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const projects = await prisma.project.findMany({
      where: {
        businessId,
        projectIsActive: true,
        projectSalesStatus: { in: statusCodes },
        revenueConfirmedAt: null,
      },
      select: {
        id: true,
        projectNo: true,
        projectSalesStatus: true,
        customer: { select: { customerName: true } },
      },
      orderBy: { projectNo: 'asc' },
    });

    const warnings: RewardConfirmationWarning[] = projects.map((p) => ({
      projectId: p.id,
      projectNo: p.projectNo,
      customerName: p.customer?.customerName ?? null,
      statusCode: p.projectSalesStatus,
      statusLabel: statusLabelMap.get(p.projectSalesStatus) ?? p.projectSalesStatus,
    }));

    return NextResponse.json({ success: true, data: warnings });
  } catch (error) {
    return handleApiError(error);
  }
}
