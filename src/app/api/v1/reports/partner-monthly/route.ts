import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import {
  getCurrentMonth,
  getBusinessPartnerScope,
  getKpiDefinitions,
  getRevenueMonth,
  getRevenueAmount,
  getActiveFieldKeys,
  injectFormulaValues,
} from '@/lib/revenue-helpers';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';
import type {
  PartnerMonthlyReportResponse,
  ReportKpiSummary,
  ReportStatusBreakdown,
  ReportProject,
} from '@/types/report';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string; partnerId: number | null };
    const { searchParams } = request.nextUrl;
    const month = searchParams.get('month') || getCurrentMonth();
    const businessIdParam = searchParams.get('businessId');

    if (!businessIdParam) {
      throw ApiError.badRequest('事業IDが必要です');
    }
    const businessId = parseInt(businessIdParam, 10);
    if (isNaN(businessId)) throw ApiError.badRequest('不正な事業IDです');

    // 権限チェック
    let partnerIds: number[] | null = null;

    if (['partner_admin', 'partner_staff'].includes(user.role)) {
      if (!user.partnerId) throw ApiError.forbidden('代理店情報が設定されていません');

      if (user.role === 'partner_admin') {
        partnerIds = await getBusinessPartnerScope(prisma, user.partnerId, businessId);
      } else {
        // partner_staff: 自分がアサインされた案件の代理店のみ
        partnerIds = [user.partnerId];
      }
    } else if (!['admin', 'staff'].includes(user.role)) {
      throw ApiError.forbidden();
    }
    // admin/staff: partnerIds=null → 全代理店（ただしこのAPIは代理店向けなのでpartnerIdが必要）

    // 事業取得
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, businessName: true, businessConfig: true, businessIsActive: true },
    });
    if (!business || !business.businessIsActive) throw ApiError.notFound('事業が見つかりません');

    // KPI定義取得（削除済みフィールドを参照する KPI を除外）
    const activeKeys = getActiveFieldKeys(business.businessConfig);
    const kpiDefinitions = getKpiDefinitions(business.businessConfig).filter(
      (k) => !(k.aggregation === 'sum' && k.sourceField && !activeKeys.has(k.sourceField)),
    );

    // ステータス定義取得
    const statusDefs = await prisma.businessStatusDefinition.findMany({
      where: { businessId, statusIsActive: true },
      orderBy: { statusSortOrder: 'asc' },
      select: { statusCode: true, statusLabel: true, statusColor: true },
    });

    // 案件取得（該当月 + 代理店スコープ）
    const projectWhere: Record<string, unknown> = {
      businessId,
      projectIsActive: true,
    };
    if (partnerIds) {
      projectWhere.partnerId = { in: partnerIds };
    }

    const projects = await prisma.project.findMany({
      where: projectWhere,
      select: {
        id: true,
        projectNo: true,
        projectSalesStatus: true,
        projectExpectedCloseMonth: true,
        projectCustomData: true,
        customer: { select: { customerName: true } },
      },
    });

    // formula フィールドの再計算
    const bizConfig = business.businessConfig as { projectFields?: ProjectFieldDefinition[] } | null;
    const projectFields = bizConfig?.projectFields ?? [];
    if (projectFields.some((f) => f.type === 'formula')) {
      injectFormulaValues(projects, projectFields);
    }

    // KPI サマリー計算（該当月のみ）
    const kpiSummaries: ReportKpiSummary[] = kpiDefinitions.map((kpi) => {
      let actual = 0;
      let projectCount = 0;

      for (const p of projects) {
        const pMonth = getRevenueMonth(
          { id: p.id, projectExpectedCloseMonth: p.projectExpectedCloseMonth, projectCustomData: p.projectCustomData },
          kpi.dateField,
        );
        if (pMonth !== month) continue;
        if (kpi.statusFilter && p.projectSalesStatus !== kpi.statusFilter) continue;

        projectCount++;
        if (kpi.aggregation === 'sum' && kpi.sourceField) {
          actual += getRevenueAmount(
            { id: p.id, projectExpectedCloseMonth: p.projectExpectedCloseMonth, projectCustomData: p.projectCustomData },
            kpi.sourceField,
          );
        } else if (kpi.aggregation === 'count') {
          actual += 1;
        }
      }

      return {
        kpiKey: kpi.key,
        label: kpi.label,
        unit: kpi.unit,
        actual,
        projectCount,
      };
    });

    // ステータス別内訳（該当月の案件のみ）
    // 「該当月」= projectExpectedCloseMonth が当該月の案件
    const monthProjects = projects.filter((p) => p.projectExpectedCloseMonth === month);

    const primaryKpi = kpiDefinitions.find((k) => k.isPrimary) ?? kpiDefinitions[0];
    const statusMap = new Map<string, { count: number; amount: number }>();

    for (const p of monthProjects) {
      const entry = statusMap.get(p.projectSalesStatus) ?? { count: 0, amount: 0 };
      entry.count++;
      if (primaryKpi?.sourceField) {
        entry.amount += getRevenueAmount(
          { id: p.id, projectExpectedCloseMonth: p.projectExpectedCloseMonth, projectCustomData: p.projectCustomData },
          primaryKpi.sourceField,
        );
      }
      statusMap.set(p.projectSalesStatus, entry);
    }

    const statusBreakdown: ReportStatusBreakdown[] = statusDefs.map((sd) => {
      const entry = statusMap.get(sd.statusCode) ?? { count: 0, amount: 0 };
      return {
        statusCode: sd.statusCode,
        statusLabel: sd.statusLabel,
        statusColor: sd.statusColor,
        projectCount: entry.count,
        amount: entry.amount,
      };
    });

    // 案件一覧（該当月）
    const statusDefMap = new Map(statusDefs.map((sd) => [sd.statusCode, sd]));
    const reportProjects: ReportProject[] = monthProjects.map((p) => {
      const sd = statusDefMap.get(p.projectSalesStatus);
      let amount = 0;
      if (primaryKpi?.sourceField) {
        amount = getRevenueAmount(
          { id: p.id, projectExpectedCloseMonth: p.projectExpectedCloseMonth, projectCustomData: p.projectCustomData },
          primaryKpi.sourceField,
        );
      }
      return {
        id: p.id,
        projectNo: p.projectNo,
        customerName: p.customer?.customerName ?? null,
        projectSalesStatus: p.projectSalesStatus,
        statusLabel: sd?.statusLabel ?? null,
        statusColor: sd?.statusColor ?? null,
        amount,
        expectedCloseMonth: p.projectExpectedCloseMonth,
      };
    });

    // 合計
    const totalAmount = reportProjects.reduce((sum, p) => sum + p.amount, 0);

    const response: PartnerMonthlyReportResponse = {
      month,
      businessId,
      businessName: business.businessName,
      kpiSummaries,
      statusBreakdown,
      projects: reportProjects,
      totalProjectCount: monthProjects.length,
      totalAmount,
    };

    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    return handleApiError(error);
  }
}
