import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

import {
  getFiscalYearMonths,
  getMonthLabel,
  getBusinessIdsForUser,
  getKpiDefinition,
  getPrimaryKpiDefinition,
  calculateKpiMonthlyActuals,
} from '@/lib/revenue-helpers';

// ============================================
// GET /api/v1/dashboard/revenue-trend?year=2025&businessId=1&kpiKey=revenue
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string; partnerId?: number | null };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { searchParams } = request.nextUrl;
    const yearParam = searchParams.get('year');
    if (!yearParam) throw ApiError.badRequest('year パラメータが必要です');
    const year = parseInt(yearParam, 10);
    if (isNaN(year) || year < 2020 || year > 2100) {
      throw ApiError.badRequest('year は 2020〜2100 の範囲で指定してください');
    }

    const businessIdParam = searchParams.get('businessId');
    const businessId = businessIdParam ? parseInt(businessIdParam, 10) : null;

    const kpiKeyParam = searchParams.get('kpiKey') ?? null;

    // スコープ制御
    const allowedIds = await getBusinessIdsForUser(prisma, user);

    if (businessId !== null && allowedIds !== null && !allowedIds.includes(businessId)) {
      throw ApiError.forbidden();
    }

    const fiscalMonths = getFiscalYearMonths(year);
    const startMonth = fiscalMonths[0];
    const endMonth = fiscalMonths[11];

    // 対象事業を取得
    const businessWhere: Record<string, unknown> = { businessIsActive: true };
    if (businessId !== null) {
      businessWhere.id = businessId;
    } else if (allowedIds !== null) {
      businessWhere.id = { in: allowedIds };
    }

    const businesses = await prisma.business.findMany({
      where: businessWhere,
      select: { id: true, businessConfig: true },
    });

    // 月別実績を集計
    const monthlyTotals = new Map<string, number>();
    for (const month of fiscalMonths) {
      monthlyTotals.set(month, 0);
    }

    // KPI 定義を最初の事業から解決してラベル・単位を確定する
    let resolvedKpiKey: string = kpiKeyParam ?? 'revenue';
    let resolvedKpiLabel: string = '売上金額';
    let resolvedKpiUnit: string = '円';

    for (const biz of businesses) {
      const kpiDef = kpiKeyParam
        ? getKpiDefinition(biz.businessConfig, kpiKeyParam)
        : getPrimaryKpiDefinition(biz.businessConfig);
      if (!kpiDef) continue;

      // 最初に見つかった定義でラベル・単位を確定（全事業で同一 kpiKey を想定）
      resolvedKpiKey = kpiDef.key;
      resolvedKpiLabel = kpiDef.label;
      resolvedKpiUnit = kpiDef.unit;

      const actuals = await calculateKpiMonthlyActuals(prisma, biz.id, kpiDef, startMonth, endMonth);
      for (const actual of actuals) {
        monthlyTotals.set(actual.month, (monthlyTotals.get(actual.month) ?? 0) + actual.actualValue);
      }
    }

    // 月別目標を集計
    const targetWhere: Record<string, unknown> = {
      kpiKey: resolvedKpiKey,
      targetMonth: { gte: startMonth, lte: endMonth },
    };
    if (businessId !== null) {
      targetWhere.businessId = businessId;
    } else if (allowedIds !== null) {
      targetWhere.businessId = { in: allowedIds };
    }

    const targets = await prisma.salesTarget.findMany({ where: targetWhere });
    const targetMap = new Map<string, number>();
    for (const t of targets) {
      targetMap.set(t.targetMonth, (targetMap.get(t.targetMonth) ?? 0) + Number(t.targetAmount));
    }

    // レスポンス構築
    const months = fiscalMonths.map((month) => ({
      month,
      monthLabel: getMonthLabel(month),
      targetAmount: targetMap.get(month) ?? 0,
      actualAmount: monthlyTotals.get(month) ?? 0,
    }));

    return NextResponse.json({
      success: true,
      data: {
        year,
        kpiKey: resolvedKpiKey,
        kpiLabel: resolvedKpiLabel,
        kpiUnit: resolvedKpiUnit,
        months,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
