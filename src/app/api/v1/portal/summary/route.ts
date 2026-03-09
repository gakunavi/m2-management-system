import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import {
  getBusinessPartnerScope,
  getRevenueRecognition,
  getRevenueAmount,
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

    const businessSummaries = businesses.map((biz) => {
      const rr = getRevenueRecognition(biz.businessConfig);
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

        // 売上計上ルールがある場合のみ金額と受注件数を集計
        if (rr) {
          if (project.projectSalesStatus === rr.statusCode) {
            totalAmount += getRevenueAmount(
              {
                id: 0,
                projectExpectedCloseMonth: project.projectExpectedCloseMonth,
                projectCustomData: project.projectCustomData,
              },
              rr.amountField,
            );
            wonProjectCount += 1;
          }
        }
      }

      return {
        businessId: biz.id,
        businessName: biz.businessName,
        totalAmount,
        projectCount,
        wonProjectCount,
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
    };

    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    return handleApiError(error);
  }
}
