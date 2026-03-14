import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';
import {
  getBusinessPartnerScope,
  getRevenueAmount,
  getRevenueMonth,
  getKpiDefinition,
  getPrimaryKpiDefinition,
  getActiveFieldKeys,
  injectFormulaValues,
} from '@/lib/revenue-helpers';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';

// ============================================
// GET /api/v1/portal/pipeline?businessId=1&kpiKey=revenue&month=2026-03
// パートナーポータル用パイプライン集計
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string; partnerId: number | null };
    if (!['partner_admin', 'partner_staff'].includes(user.role)) {
      throw ApiError.forbidden();
    }
    if (!user.partnerId) {
      throw ApiError.forbidden('代理店情報が設定されていません');
    }

    const { searchParams } = request.nextUrl;
    const businessIdParam = searchParams.get('businessId');
    const businessId = businessIdParam ? parseInt(businessIdParam, 10) : null;
    const kpiKey = searchParams.get('kpiKey') ?? null;
    const monthParam = searchParams.get('month') ?? null;
    const startMonthParam = searchParams.get('startMonth') ?? null;
    const endMonthParam = searchParams.get('endMonth') ?? null;
    const periodParam = searchParams.get('period') ?? null;

    // ============================================
    // スコープ構築
    // ============================================

    const projectWhere: Record<string, unknown> = {
      projectIsActive: true,
    };

    if (user.role === 'partner_admin') {
      const partnerIds = await getBusinessPartnerScope(prisma, user.partnerId, businessId ?? undefined);
      projectWhere.partnerId = { in: partnerIds };
    } else {
      projectWhere.projectAssignedUserId = user.id;
    }

    if (businessId !== null) {
      projectWhere.businessId = businessId;
    }

    // ============================================
    // 対象案件を取得
    // ============================================

    const projects = await prisma.project.findMany({
      where: projectWhere,
      select: {
        id: true,
        businessId: true,
        projectSalesStatus: true,
        projectExpectedCloseMonth: true,
        projectCustomData: true,
      },
    });

    if (projects.length === 0) {
      return NextResponse.json({
        success: true,
        data: { statuses: [], total: { projectCount: 0, totalAmount: 0 } },
      });
    }

    // ============================================
    // 事業情報とステータス定義を取得
    // ============================================

    const businessIds = Array.from(new Set(projects.map((p) => p.businessId)));

    const statusDefWhere: Record<string, unknown> = {
      businessId: { in: businessIds },
      statusIsActive: true,
    };

    const [businesses, statusDefs] = await Promise.all([
      prisma.business.findMany({
        where: { id: { in: businessIds }, businessIsActive: true },
        select: { id: true, businessConfig: true },
      }),
      prisma.businessStatusDefinition.findMany({
        where: statusDefWhere,
        orderBy: { statusSortOrder: 'asc' },
        select: {
          businessId: true,
          statusCode: true,
          statusLabel: true,
          statusColor: true,
          statusSortOrder: true,
        },
      }),
    ]);

    // ============================================
    // formula フィールドの再計算
    // ============================================

    for (const biz of businesses) {
      const config = biz.businessConfig as { projectFields?: ProjectFieldDefinition[] } | null;
      const fields = config?.projectFields ?? [];
      if (fields.some((f) => f.type === 'formula')) {
        const bizProjects = projects.filter((p) => p.businessId === biz.id);
        injectFormulaValues(bizProjects, fields);
      }
    }

    // ============================================
    // 事業ごとの KPI 解決マップを構築
    // ============================================

    type KpiResolution =
      | { type: 'sum'; sourceField: string }
      | { type: 'count' }
      | { type: 'none' };

    const kpiResolutionMap = new Map<number, KpiResolution>();
    let resolvedKpiUnit: string | undefined;
    let resolvedKpiLabel: string | undefined;

    const kpiDateFieldMap = new Map<number, string>();

    for (const biz of businesses) {
      const kpiDef = kpiKey
        ? getKpiDefinition(biz.businessConfig, kpiKey)
        : getPrimaryKpiDefinition(biz.businessConfig);

      // sourceField が削除済みフィールドを参照していないか検証
      const activeKeys = getActiveFieldKeys(biz.businessConfig);

      if (!kpiDef) {
        kpiResolutionMap.set(biz.id, { type: 'none' });
      } else if (kpiDef.aggregation === 'sum' && kpiDef.sourceField && activeKeys.has(kpiDef.sourceField)) {
        kpiResolutionMap.set(biz.id, { type: 'sum', sourceField: kpiDef.sourceField });
      } else if (kpiDef.aggregation === 'count') {
        kpiResolutionMap.set(biz.id, { type: 'count' });
      } else {
        kpiResolutionMap.set(biz.id, { type: 'none' });
      }
      if (kpiDef && !resolvedKpiUnit) resolvedKpiUnit = kpiDef.unit;
      if (kpiDef && !resolvedKpiLabel) resolvedKpiLabel = kpiDef.label;
      kpiDateFieldMap.set(biz.id, kpiDef?.dateField ?? 'projectExpectedCloseMonth');
    }

    // ============================================
    // ステータス定義マップを構築
    // ============================================

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

    // ============================================
    // ステータス別に件数・金額を集計
    // ============================================

    const statusAgg = new Map<string, { projectCount: number; totalAmount: number }>();

    for (const p of projects) {
      // 月フィルター（KPI dateField を使用）
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
      const entry = statusAgg.get(code) ?? { projectCount: 0, totalAmount: 0 };
      entry.projectCount++;

      const resolution = kpiResolutionMap.get(p.businessId) ?? { type: 'none' as const };
      if (resolution.type === 'sum') {
        entry.totalAmount += getRevenueAmount(
          {
            id: p.id,
            projectExpectedCloseMonth: p.projectExpectedCloseMonth,
            projectCustomData: p.projectCustomData,
          },
          resolution.sourceField,
        );
      } else if (resolution.type === 'count') {
        entry.totalAmount += 1;
      }

      statusAgg.set(code, entry);
    }

    // ============================================
    // レスポンス構築（statusSortOrder順）
    // ============================================

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
