import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { getBusinessPartnerScope, getRevenueRecognition, getRevenueAmount } from '@/lib/revenue-helpers';

// ============================================
// GET /api/v1/portal/pipeline?businessId=1&month=2026-03
// パートナーポータル用パイプライン集計
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string; partnerId: number | null };

    // partner_admin / partner_staff のみ許可
    if (!['partner_admin', 'partner_staff'].includes(user.role)) {
      throw ApiError.forbidden();
    }

    if (!user.partnerId) {
      throw ApiError.forbidden('代理店情報が設定されていません');
    }

    const { searchParams } = request.nextUrl;
    const businessIdParam = searchParams.get('businessId');
    const businessId = businessIdParam ? parseInt(businessIdParam, 10) : null;
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
      // partner_admin: 事業別階層で自代理店 + 下位代理店すべての案件
      const partnerIds = await getBusinessPartnerScope(prisma, user.partnerId, businessId ?? undefined);
      projectWhere.partnerId = { in: partnerIds };
    } else {
      // partner_staff: 自分がアサインされた案件のみ
      projectWhere.projectAssignedUserId = user.id;
    }

    // 事業フィルター（任意）
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
        data: { statuses: [] },
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
    if (businessId !== null) {
      statusDefWhere.businessId = businessId;
    }

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
    // 事業ごとの金額フィールドマップを構築
    // ============================================

    const amountFieldMap = new Map<number, string>();
    for (const biz of businesses) {
      const rr = getRevenueRecognition(biz.businessConfig);
      if (rr) {
        amountFieldMap.set(biz.id, rr.amountField);
      }
    }

    // ============================================
    // ステータス定義マップを構築
    // 同一ステータスコードが複数事業にまたがる場合は最初の定義を使用
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
      // 期間フィルター（period=all は全件通過）
      if (periodParam !== 'all' && (monthParam || startMonthParam || endMonthParam)) {
        const month = p.projectExpectedCloseMonth;
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

      const amountField = amountFieldMap.get(p.businessId);
      if (amountField) {
        entry.totalAmount += getRevenueAmount(
          {
            id: p.id,
            projectExpectedCloseMonth: p.projectExpectedCloseMonth,
            projectCustomData: p.projectCustomData,
          },
          amountField,
        );
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

    return NextResponse.json({
      success: true,
      data: { statuses },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
