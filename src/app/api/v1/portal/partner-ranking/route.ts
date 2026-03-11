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
  injectFormulaValues,
} from '@/lib/revenue-helpers';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';

// ============================================
// GET /api/v1/portal/partner-ranking?businessId=1&mode=staff&kpiKey=revenue
// パートナーポータル用ランキング
// mode=staff: 自社スタッフ別ランキング
// mode=subordinate: 下位代理店別ランキング
// partner_admin のみアクセス可
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string; partnerId: number | null };
    if (user.role !== 'partner_admin') throw ApiError.forbidden();
    if (!user.partnerId) throw ApiError.forbidden('代理店情報が設定されていません');

    const { searchParams } = request.nextUrl;
    const businessIdParam = searchParams.get('businessId');
    if (!businessIdParam) throw ApiError.badRequest('businessId パラメータが必要です');
    const businessId = parseInt(businessIdParam, 10);
    if (isNaN(businessId)) throw ApiError.badRequest('businessId が不正です');

    const mode = searchParams.get('mode') ?? 'staff';
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '10', 10)));
    const kpiKeyParam = searchParams.get('kpiKey') ?? null;
    const monthParam = searchParams.get('month') ?? null;
    const startMonthParam = searchParams.get('startMonth') ?? null;
    const endMonthParam = searchParams.get('endMonth') ?? null;
    const periodParam = searchParams.get('period') ?? null;

    // ============================================
    // KPI定義を取得
    // ============================================

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { businessConfig: true },
    });
    if (!business) throw ApiError.notFound('事業が見つかりません');

    const kpiDef = kpiKeyParam
      ? getKpiDefinition(business.businessConfig, kpiKeyParam)
      : getPrimaryKpiDefinition(business.businessConfig);

    const statusFilters: string[] | null = kpiDef?.statusFilter
      ? Array.isArray(kpiDef.statusFilter) ? kpiDef.statusFilter : [kpiDef.statusFilter]
      : null;
    const sourceField = kpiDef?.aggregation === 'sum' && kpiDef?.sourceField
      ? kpiDef.sourceField
      : null;
    const dateField = kpiDef?.dateField ?? 'projectExpectedCloseMonth';

    // ============================================
    // パートナースコープで案件取得
    // ============================================

    const partnerIds = await getBusinessPartnerScope(prisma, user.partnerId, businessId);

    const projectWhere: Record<string, unknown> = {
      businessId,
      projectIsActive: true,
      partnerId: { in: partnerIds },
    };
    if (statusFilters && statusFilters.length > 0) {
      projectWhere.projectSalesStatus = { in: statusFilters };
    }

    const projects = await prisma.project.findMany({
      where: projectWhere,
      select: {
        partnerId: true,
        projectAssignedUserId: true,
        projectExpectedCloseMonth: true,
        projectCustomData: true,
        partner: { select: { id: true, partnerName: true } },
        assignedUser: { select: { id: true, userName: true } },
      },
    });

    // formula フィールドの再計算
    const bizConfig = business?.businessConfig as { projectFields?: ProjectFieldDefinition[] } | null;
    const projectFields = bizConfig?.projectFields ?? [];
    if (projectFields.some((f) => f.type === 'formula')) {
      injectFormulaValues(projects, projectFields);
    }

    // ============================================
    // 月フィルター関数
    // ============================================

    const passesMonthFilter = (p: { projectExpectedCloseMonth: string | null; projectCustomData: unknown }): boolean => {
      if (periodParam === 'all') return true;
      if (!monthParam && !startMonthParam && !endMonthParam) return true;

      const month = getRevenueMonth(
        { id: 0, projectExpectedCloseMonth: p.projectExpectedCloseMonth, projectCustomData: p.projectCustomData },
        dateField,
      );
      if (!month) return false;

      if (monthParam) return month === monthParam;
      if (startMonthParam && month < startMonthParam) return false;
      if (endMonthParam && month > endMonthParam) return false;
      return true;
    };

    const calcAmount = (p: { projectCustomData: unknown }): number => {
      if (sourceField) {
        return getRevenueAmount(
          { id: 0, projectExpectedCloseMonth: null, projectCustomData: p.projectCustomData },
          sourceField,
        );
      }
      if (kpiDef?.aggregation === 'count') return 1;
      return 0;
    };

    // ============================================
    // 集計
    // ============================================

    if (mode === 'subordinate') {
      // 下位代理店別ランキング
      const partnerAgg = new Map<number | null, { name: string; amount: number; count: number }>();

      for (const p of projects) {
        if (!passesMonthFilter(p)) continue;

        const entry = partnerAgg.get(p.partnerId) ?? {
          name: p.partner?.partnerName ?? '不明',
          amount: 0,
          count: 0,
        };
        entry.amount += calcAmount(p);
        entry.count++;
        partnerAgg.set(p.partnerId, entry);
      }

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
        data: { rankings, kpiUnit: kpiDef?.unit, mode },
      });
    }

    // スタッフ別ランキング（自社代理店のスタッフのみ）
    const staffAgg = new Map<number | null, { name: string; amount: number; count: number }>();

    for (const p of projects) {
      if (p.partnerId !== user.partnerId) continue;
      if (!passesMonthFilter(p)) continue;

      const userId = p.projectAssignedUserId;
      const entry = staffAgg.get(userId) ?? {
        name: p.assignedUser?.userName ?? '未割当',
        amount: 0,
        count: 0,
      };
      entry.amount += calcAmount(p);
      entry.count++;
      staffAgg.set(userId, entry);
    }

    const sorted = Array.from(staffAgg.entries())
      .sort(([, a], [, b]) => b.amount - a.amount)
      .slice(0, limit);

    const rankings = sorted.map(([userId, data], idx) => ({
      rank: idx + 1,
      partnerId: userId,
      partnerName: data.name,
      totalAmount: data.amount,
      projectCount: data.count,
    }));

    return NextResponse.json({
      success: true,
      data: { rankings, kpiUnit: kpiDef?.unit, mode },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
