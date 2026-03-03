import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { salesTargetBulkSchema } from '@/lib/validations/sales-target';
import {
  getFiscalYearMonths,
  getKpiDefinition,
  getPrimaryKpiDefinition,
  calculateKpiMonthlyActuals,
} from '@/lib/revenue-helpers';

// ============================================
// GET /api/v1/businesses/:id/sales-targets?year=2025&kpiKey=revenue
// ============================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id } = await params;
    const businessId = parseInt(id, 10);
    if (isNaN(businessId)) throw ApiError.notFound('事業が見つかりません');

    const yearParam = request.nextUrl.searchParams.get('year');
    if (!yearParam) throw ApiError.badRequest('year パラメータが必要です');
    const year = parseInt(yearParam, 10);
    if (isNaN(year) || year < 2020 || year > 2100) {
      throw ApiError.badRequest('year は 2020〜2100 の範囲で指定してください');
    }

    // kpiKey パラメータ（デフォルト: プライマリ KPI or 'revenue'）
    const kpiKeyParam = request.nextUrl.searchParams.get('kpiKey');

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, businessConfig: true },
    });
    if (!business) throw ApiError.notFound('事業が見つかりません');

    // KPI 定義を取得
    const kpiKey = kpiKeyParam ?? getPrimaryKpiDefinition(business.businessConfig)?.key ?? 'revenue';
    const kpiDefinition = getKpiDefinition(business.businessConfig, kpiKey);

    const fiscalMonths = getFiscalYearMonths(year);
    const startMonth = fiscalMonths[0];
    const endMonth = fiscalMonths[11];

    // 目標を取得（kpiKey でフィルタ）
    const targets = await prisma.salesTarget.findMany({
      where: {
        businessId,
        kpiKey,
        targetMonth: { gte: startMonth, lte: endMonth },
      },
    });
    const targetMap = new Map(
      targets.map((t) => [t.targetMonth, Number(t.targetAmount)]),
    );

    // 実績を計算
    let actualsMap = new Map<string, { actualValue: number; projectCount: number }>();

    if (kpiDefinition) {
      const actuals = await calculateKpiMonthlyActuals(
        prisma,
        businessId,
        kpiDefinition,
        startMonth,
        endMonth,
      );
      actualsMap = new Map(
        actuals.map((a) => [a.month, { actualValue: a.actualValue, projectCount: a.projectCount }]),
      );
    }

    // 月別データ構築
    const months = fiscalMonths.map((month) => {
      const targetAmount = targetMap.get(month) ?? 0;
      const actual = actualsMap.get(month);
      const actualAmount = actual?.actualValue ?? 0;
      const projectCount = actual?.projectCount ?? 0;
      const achievementRate =
        targetAmount > 0 ? Math.round((actualAmount / targetAmount) * 1000) / 10 : null;

      return { month, targetAmount, actualAmount, achievementRate, projectCount };
    });

    // 年間合計
    const yearTotal = months.reduce(
      (acc, m) => ({
        targetAmount: acc.targetAmount + m.targetAmount,
        actualAmount: acc.actualAmount + m.actualAmount,
        projectCount: acc.projectCount + m.projectCount,
      }),
      { targetAmount: 0, actualAmount: 0, projectCount: 0 },
    );

    return NextResponse.json({
      success: true,
      data: {
        businessId,
        year,
        kpiKey,
        kpiDefinition,
        months,
        yearTotal: {
          ...yearTotal,
          achievementRate:
            yearTotal.targetAmount > 0
              ? Math.round((yearTotal.actualAmount / yearTotal.targetAmount) * 1000) / 10
              : null,
        },
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// PUT /api/v1/businesses/:id/sales-targets
// ============================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (user.role !== 'admin') throw ApiError.forbidden();

    const { id } = await params;
    const businessId = parseInt(id, 10);
    if (isNaN(businessId)) throw ApiError.notFound('事業が見つかりません');

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true },
    });
    if (!business) throw ApiError.notFound('事業が見つかりません');

    const body = await request.json();
    const data = salesTargetBulkSchema.parse(body);
    const kpiKey = data.kpiKey;

    const result = await prisma.$transaction(async (tx) => {
      let savedCount = 0;
      let deletedCount = 0;

      for (const target of data.targets) {
        if (target.targetAmount === 0) {
          const deleted = await tx.salesTarget.deleteMany({
            where: { businessId, targetMonth: target.month, kpiKey },
          });
          deletedCount += deleted.count;
        } else {
          await tx.salesTarget.upsert({
            where: {
              businessId_targetMonth_kpiKey: {
                businessId,
                targetMonth: target.month,
                kpiKey,
              },
            },
            create: {
              businessId,
              targetMonth: target.month,
              kpiKey,
              targetAmount: target.targetAmount,
              createdBy: user.id,
              updatedBy: user.id,
            },
            update: {
              targetAmount: target.targetAmount,
              updatedBy: user.id,
            },
          });
          savedCount++;
        }
      }

      return { savedCount, deletedCount };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return handleApiError(error);
  }
}
