import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

import {
  getBusinessIdsForUser,
  getRevenueAmount,
  getRevenueMonth,
  getKpiDefinition,
  getPrimaryKpiDefinition,
  getActiveFieldKeys,
  injectFormulaValues,
} from '@/lib/revenue-helpers';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';

// ============================================
// GET /api/v1/dashboard/partner-ranking?businessId=1&kpiKey=revenue&month=2026-03&limit=10
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string; partnerId?: number | null };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { searchParams } = request.nextUrl;
    const businessIdParam = searchParams.get('businessId');
    if (!businessIdParam) throw ApiError.badRequest('businessId パラメータが必要です');
    const businessId = parseInt(businessIdParam, 10);
    if (isNaN(businessId)) throw ApiError.badRequest('businessId が不正です');

    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '10', 10)));
    const kpiKeyParam = searchParams.get('kpiKey') ?? null;
    const monthParam = searchParams.get('month') ?? null;
    const startMonthParam = searchParams.get('startMonth') ?? null;
    const endMonthParam = searchParams.get('endMonth') ?? null;
    const periodParam = searchParams.get('period') ?? null;

    // スコープ確認
    const allowedIds = await getBusinessIdsForUser(prisma, user);
    if (allowedIds !== null && !allowedIds.includes(businessId)) {
      throw ApiError.forbidden();
    }

    // KPI定義を取得
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { businessConfig: true },
    });
    if (!business) throw ApiError.notFound('事業が見つかりません');

    const kpiDef = kpiKeyParam
      ? getKpiDefinition(business.businessConfig, kpiKeyParam)
      : getPrimaryKpiDefinition(business.businessConfig);

    // KPI定義ベースでステータスフィルター・金額フィールドを解決
    const statusFilters: string[] | null = kpiDef?.statusFilter
      ? Array.isArray(kpiDef.statusFilter)
        ? kpiDef.statusFilter
        : [kpiDef.statusFilter]
      : null;
    // sourceField が削除済みフィールドを参照していないか検証
    const activeKeys = getActiveFieldKeys(business.businessConfig);
    const sourceField = kpiDef?.aggregation === 'sum' && kpiDef?.sourceField && activeKeys.has(kpiDef.sourceField)
      ? kpiDef.sourceField
      : null;
    const dateField = kpiDef?.dateField ?? 'projectExpectedCloseMonth';

    // 案件を取得
    const projectWhere: Record<string, unknown> = {
      businessId,
      projectIsActive: true,
    };
    if (statusFilters && statusFilters.length > 0) {
      projectWhere.projectSalesStatus = { in: statusFilters };
    }

    const projects = await prisma.project.findMany({
      where: projectWhere,
      select: {
        partnerId: true,
        projectExpectedCloseMonth: true,
        projectCustomData: true,
        partner: { select: { id: true, partnerName: true } },
      },
    });

    // formula フィールドの再計算
    const bizConfig = business.businessConfig as { projectFields?: ProjectFieldDefinition[] } | null;
    const projectFields = bizConfig?.projectFields ?? [];
    if (projectFields.some((f) => f.type === 'formula')) {
      injectFormulaValues(projects, projectFields);
    }

    // 代理店別に集計
    const partnerAgg = new Map<number | null, { name: string; amount: number; count: number }>();

    for (const p of projects) {
      // 月フィルター（単月 / 範囲 / period=all は全件通過）
      if (periodParam !== 'all' && (monthParam || startMonthParam || endMonthParam)) {
        const month = getRevenueMonth(
          { id: 0, projectExpectedCloseMonth: p.projectExpectedCloseMonth, projectCustomData: p.projectCustomData },
          dateField,
        );
        if (!month) continue;
        if (monthParam) {
          if (month !== monthParam) continue;
        } else {
          if (startMonthParam && month < startMonthParam) continue;
          if (endMonthParam && month > endMonthParam) continue;
        }
      }

      const partnerId = p.partnerId;
      const partnerName = p.partner?.partnerName ?? '直販';

      let amount = 0;
      if (sourceField) {
        amount = getRevenueAmount(
          { id: 0, projectExpectedCloseMonth: null, projectCustomData: p.projectCustomData },
          sourceField,
        );
      } else if (kpiDef?.aggregation === 'count') {
        amount = 1;
      }

      const entry = partnerAgg.get(partnerId) || { name: partnerName, amount: 0, count: 0 };
      entry.amount += amount;
      entry.count++;
      partnerAgg.set(partnerId, entry);
    }

    // ソート（金額降順）→ランキング
    const sorted = Array.from(partnerAgg.entries())
      .sort(([, a], [, b]) => b.amount - a.amount)
      .slice(0, limit);

    const rankings = sorted.map(([partnerId, data], idx) => ({
      rank: idx + 1,
      partnerId,
      partnerName: data.name,
      totalAmount: data.amount,
      projectCount: data.count,
    }));

    return NextResponse.json({
      success: true,
      data: { rankings, kpiUnit: kpiDef?.unit, kpiLabel: kpiDef?.label },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
