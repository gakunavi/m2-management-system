import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import {
  getBusinessPartnerScope,
  getRevenueAmount,
  getPrimaryKpiDefinition,
} from '@/lib/revenue-helpers';
import type { PortalSummaryResponse } from '@/types/dashboard';

// ============================================
// GET /api/v1/portal/summary?month=2026-03
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string; partnerId: number | null };

    // partner_admin と partner_staff のみアクセス可能
    if (!['partner_admin', 'partner_staff'].includes(user.role)) {
      throw ApiError.forbidden();
    }

    if (!user.partnerId) {
      throw ApiError.forbidden('代理店情報が設定されていません');
    }

    // ============================================
    // 期間パラメータ解析
    // ============================================

    const { searchParams } = request.nextUrl;
    const monthParam = searchParams.get('month') ?? null;
    const startMonthParam = searchParams.get('startMonth') ?? null;
    const endMonthParam = searchParams.get('endMonth') ?? null;
    const periodParam = searchParams.get('period') ?? null;

    // ============================================
    // スコープ別プロジェクト取得
    // ============================================

    let projects: Array<{
      businessId: number;
      partnerId: number | null;
      projectAssignedUserId: number | null;
      projectSalesStatus: string;
      projectExpectedCloseMonth: string | null;
      projectCustomData: unknown;
    }>;

    const projectSelect = {
      businessId: true as const,
      partnerId: true as const,
      projectAssignedUserId: true as const,
      projectSalesStatus: true as const,
      projectExpectedCloseMonth: true as const,
      projectCustomData: true as const,
    };

    if (user.role === 'partner_admin') {
      // partner_admin: 事業別階層で自社 + 下位代理店すべてのプロジェクト
      const partnerIds = await getBusinessPartnerScope(prisma, user.partnerId);

      projects = await prisma.project.findMany({
        where: {
          partnerId: { in: partnerIds },
          projectIsActive: true,
        },
        select: projectSelect,
      });
    } else {
      // partner_staff: 自分にアサインされたプロジェクトのみ
      projects = await prisma.project.findMany({
        where: {
          projectAssignedUserId: user.id,
          projectIsActive: true,
        },
        select: projectSelect,
      });
    }

    // ============================================
    // プロジェクトが存在する事業IDを抽出
    // ============================================

    const businessIdSet = new Set(projects.map((p) => p.businessId));
    const businessIds = Array.from(businessIdSet);

    if (businessIds.length === 0) {
      const response: PortalSummaryResponse = {
        businesses: [],
        totals: {
          totalAmount: 0,
          projectCount: 0,
          wonProjectCount: 0,
        },
      };
      return NextResponse.json({ success: true, data: response });
    }

    // ============================================
    // 対象事業の情報と設定を取得
    // ============================================

    const businesses = await prisma.business.findMany({
      where: {
        id: { in: businessIds },
        businessIsActive: true,
      },
      select: {
        id: true,
        businessName: true,
        businessConfig: true,
      },
      orderBy: { businessSortOrder: 'asc' },
    });

    // ============================================
    // 事業ごとに集計
    // ============================================

    // 最初に見つかった kpiUnit をレスポンスのデフォルトとして使用
    let resolvedKpiUnit: string | undefined;

    const businessSummaries = businesses.map((biz) => {
      const kpi = getPrimaryKpiDefinition(biz.businessConfig);
      const bizKpiUnit = kpi?.unit ?? undefined;
      if (bizKpiUnit && !resolvedKpiUnit) resolvedKpiUnit = bizKpiUnit;

      // KPI ステータスフィルター（受注判定）
      const statusFilters: string[] | null = kpi?.statusFilter
        ? Array.isArray(kpi.statusFilter)
          ? kpi.statusFilter
          : [kpi.statusFilter]
        : null;

      const bizProjects = projects.filter((p) => p.businessId === biz.id);

      let projectCount = 0;
      let totalAmount = 0;
      let wonProjectCount = 0;

      for (const project of bizProjects) {
        // 期間フィルター（period=all は全件通過）
        if (periodParam !== 'all' && (monthParam || startMonthParam || endMonthParam)) {
          const month = project.projectExpectedCloseMonth;
          if (!month) continue;
          if (monthParam) {
            if (month !== monthParam) continue;
          } else {
            if (startMonthParam && month < startMonthParam) continue;
            if (endMonthParam && month > endMonthParam) continue;
          }
        }

        projectCount++;

        // KPI 定義ベースで金額と受注件数を集計
        if (kpi && statusFilters && statusFilters.includes(project.projectSalesStatus)) {
          if (kpi.aggregation === 'sum' && kpi.sourceField) {
            totalAmount += getRevenueAmount(
              {
                id: 0,
                projectExpectedCloseMonth: project.projectExpectedCloseMonth,
                projectCustomData: project.projectCustomData,
              },
              kpi.sourceField,
            );
          } else if (kpi.aggregation === 'count') {
            totalAmount += 1;
          }
          wonProjectCount += 1;
        }
      }

      return {
        businessId: biz.id,
        businessName: biz.businessName,
        totalAmount,
        projectCount,
        wonProjectCount,
        kpiUnit: bizKpiUnit,
      };
    });

    // ============================================
    // 合計を集計
    // ============================================

    const totals = businessSummaries.reduce(
      (acc, biz) => ({
        totalAmount: acc.totalAmount + biz.totalAmount,
        projectCount: acc.projectCount + biz.projectCount,
        wonProjectCount: acc.wonProjectCount + biz.wonProjectCount,
      }),
      { totalAmount: 0, projectCount: 0, wonProjectCount: 0 },
    );

    // ============================================
    // レスポンス構築
    // ============================================

    const response: PortalSummaryResponse = {
      businesses: businessSummaries,
      totals,
      kpiUnit: resolvedKpiUnit,
    };

    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    return handleApiError(error);
  }
}
