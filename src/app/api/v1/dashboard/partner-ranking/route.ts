import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { getBusinessIdsForUser, getRevenueRecognition, getRevenueAmount } from '@/lib/revenue-helpers';

// ============================================
// GET /api/v1/dashboard/partner-ranking?businessId=1&limit=10
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

    // スコープ確認
    const allowedIds = await getBusinessIdsForUser(prisma, user);
    if (allowedIds !== null && !allowedIds.includes(businessId)) {
      throw ApiError.forbidden();
    }

    // 計上ルール取得
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { businessConfig: true },
    });
    if (!business) throw ApiError.notFound('事業が見つかりません');

    const rr = getRevenueRecognition(business.businessConfig);

    // 受注案件を取得
    const projectWhere: Record<string, unknown> = {
      businessId,
      projectIsActive: true,
    };
    if (rr) {
      projectWhere.projectSalesStatus = rr.statusCode;
    }

    const projects = await prisma.project.findMany({
      where: projectWhere,
      select: {
        partnerId: true,
        projectCustomData: true,
        partner: { select: { id: true, partnerName: true } },
      },
    });

    // 代理店別に集計
    const partnerAgg = new Map<number | null, { name: string; amount: number; count: number }>();

    for (const p of projects) {
      const partnerId = p.partnerId;
      const partnerName = p.partner?.partnerName ?? '直販';
      const amount = rr ? getRevenueAmount(
        { id: 0, projectExpectedCloseMonth: null, projectCustomData: p.projectCustomData },
        rr.amountField,
      ) : 0;

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
      data: { rankings },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
