import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { recalculateAllTierNumbers } from '@/lib/partner-hierarchy';
import { recalculateAllBusinessTierNumbers } from '@/lib/business-partner-hierarchy';

// ============================================
// POST /api/v1/admin/recalculate-tier-numbers
// 全代理店の階層番号を再計算する（管理者専用）
// ============================================

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (user.role !== 'admin') throw ApiError.forbidden();

    await prisma.$transaction(async (tx) => {
      // 1. グループ全体の階層番号を再計算
      await recalculateAllTierNumbers(tx);

      // 2. 全事業の事業別階層番号を再計算
      const businesses = await tx.business.findMany({
        where: { businessIsActive: true },
        select: { id: true },
      });

      for (const biz of businesses) {
        await recalculateAllBusinessTierNumbers(tx, biz.id);
      }
    }, { timeout: 60000 });

    return NextResponse.json({
      success: true,
      message: '全代理店の階層番号を再計算しました',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
