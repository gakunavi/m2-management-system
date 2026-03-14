import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

import { getBusinessIdsForUser, getRevenueAmount, getRevenueMonth, getKpiDefinition, getPrimaryKpiDefinition, getActiveFieldKeys, injectFormulaValues } from '@/lib/revenue-helpers';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';

// ============================================
// GET /api/v1/dashboard/pipeline?businessId=1&kpiKey=revenue&month=2026-03
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string; partnerId?: number | null };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { searchParams } = request.nextUrl;
    const businessIdParam = searchParams.get('businessId');
    const businessId = businessIdParam ? parseInt(businessIdParam, 10) : null;
    const kpiKey = searchParams.get('kpiKey') ?? null;
    const monthParam = searchParams.get('month') ?? null;
    const startMonthParam = searchParams.get('startMonth') ?? null;
    const endMonthParam = searchParams.get('endMonth') ?? null;
    const periodParam = searchParams.get('period') ?? null;

    const allowedIds = await getBusinessIdsForUser(prisma, user);
    if (businessId !== null && allowedIds !== null && !allowedIds.includes(businessId)) {
      throw ApiError.forbidden();
    }

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

    // ステータス定義を取得
    const statusDefWhere: Record<string, unknown> = { statusIsActive: true };
    if (businessId !== null) {
      statusDefWhere.businessId = businessId;
    } else if (allowedIds !== null) {
      statusDefWhere.businessId = { in: allowedIds };
    }

    const statusDefs = await prisma.businessStatusDefinition.findMany({
      where: statusDefWhere,
      orderBy: { statusSortOrder: 'asc' },
    });

    // ステータスコード→定義のマップ（同名ステータスは最初の定義を使用）
    const statusInfoMap = new Map<string, { label: string; color: string; sortOrder: number }>();
    for (const sd of statusDefs) {
      if (!statusInfoMap.has(sd.statusCode)) {
        statusInfoMap.set(sd.statusCode, {
          label: sd.statusLabel,
          color: sd.statusColor ?? '#6b7280',
          sortOrder: sd.statusSortOrder,
        });
      }
    }

    // 事業ごとの KPI 解決マップ
    // aggregation='sum'  → { type: 'sum', sourceField: string }
    // aggregation='count' → { type: 'count' }
    // KPI 定義なし       → { type: 'none' }
    type KpiResolution =
      | { type: 'sum'; sourceField: string }
      | { type: 'count' }
      | { type: 'none' };

    const kpiResolutionMap = new Map<number, KpiResolution>();
    let resolvedKpiUnit: string | undefined;
    let resolvedKpiLabel: string | undefined;
    for (const biz of businesses) {
      const kpi = kpiKey
        ? getKpiDefinition(biz.businessConfig, kpiKey)
        : getPrimaryKpiDefinition(biz.businessConfig);

      // sourceField が削除済みフィールドを参照していないか検証
      const activeKeys = getActiveFieldKeys(biz.businessConfig);

      if (!kpi) {
        kpiResolutionMap.set(biz.id, { type: 'none' });
      } else if (kpi.aggregation === 'sum' && kpi.sourceField && activeKeys.has(kpi.sourceField)) {
        kpiResolutionMap.set(biz.id, { type: 'sum', sourceField: kpi.sourceField });
      } else if (kpi.aggregation === 'count') {
        kpiResolutionMap.set(biz.id, { type: 'count' });
      } else {
        kpiResolutionMap.set(biz.id, { type: 'none' });
      }
      if (kpi && !resolvedKpiUnit) resolvedKpiUnit = kpi.unit;
      if (kpi && !resolvedKpiLabel) resolvedKpiLabel = kpi.label;
    }

    // 事業ごとの dateField を解決（月フィルター用）
    const kpiDateFieldMap = new Map<number, string>();
    for (const biz of businesses) {
      const kpi = kpiKey
        ? getKpiDefinition(biz.businessConfig, kpiKey)
        : getPrimaryKpiDefinition(biz.businessConfig);
      kpiDateFieldMap.set(biz.id, kpi?.dateField ?? 'projectExpectedCloseMonth');
    }

    // アクティブ案件を取得
    const projectWhere: Record<string, unknown> = { projectIsActive: true };
    if (businessId !== null) {
      projectWhere.businessId = businessId;
    } else if (allowedIds !== null) {
      projectWhere.businessId = { in: allowedIds };
    }

    const projects = await prisma.project.findMany({
      where: projectWhere,
      select: {
        businessId: true,
        projectSalesStatus: true,
        projectExpectedCloseMonth: true,
        projectCustomData: true,
      },
    });

    // formula フィールドの再計算
    for (const biz of businesses) {
      const config = biz.businessConfig as { projectFields?: ProjectFieldDefinition[] } | null;
      const fields = config?.projectFields ?? [];
      if (fields.some((f) => f.type === 'formula')) {
        const bizProjects = projects.filter((p) => p.businessId === biz.id);
        injectFormulaValues(bizProjects, fields);
      }
    }

    // ステータス別に集計
    const statusAgg = new Map<string, { projectCount: number; totalAmount: number }>();
    for (const p of projects) {
      // 月フィルター（単月 / 範囲 / period=all は全件通過）
      if (periodParam !== 'all' && (monthParam || startMonthParam || endMonthParam)) {
        const dateField = kpiDateFieldMap.get(p.businessId) ?? 'projectExpectedCloseMonth';
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

      const code = p.projectSalesStatus;
      const entry = statusAgg.get(code) || { projectCount: 0, totalAmount: 0 };
      entry.projectCount++;

      const resolution = kpiResolutionMap.get(p.businessId) ?? { type: 'none' };
      if (resolution.type === 'sum') {
        entry.totalAmount += getRevenueAmount(
          { id: 0, projectExpectedCloseMonth: null, projectCustomData: p.projectCustomData },
          resolution.sourceField,
        );
      } else if (resolution.type === 'count') {
        entry.totalAmount += 1;
      }

      statusAgg.set(code, entry);
    }

    // レスポンス構築
    const statuses = Array.from(statusAgg.entries())
      .map(([code, agg]) => {
        const info = statusInfoMap.get(code);
        return {
          statusCode: code,
          statusLabel: info?.label ?? code,
          statusColor: info?.color ?? '#6b7280',
          statusSortOrder: info?.sortOrder ?? 999,
          projectCount: agg.projectCount,
          totalAmount: agg.totalAmount,
        };
      })
      .sort((a, b) => a.statusSortOrder - b.statusSortOrder);

    const total = statuses.reduce(
      (acc, s) => ({
        projectCount: acc.projectCount + s.projectCount,
        totalAmount: acc.totalAmount + s.totalAmount,
      }),
      { projectCount: 0, totalAmount: 0 },
    );

    return NextResponse.json({
      success: true,
      data: { statuses, total, kpiUnit: resolvedKpiUnit, kpiLabel: resolvedKpiLabel },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
