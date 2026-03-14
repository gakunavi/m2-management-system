import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ApiError, handleApiError } from '@/lib/error-handler';

/**
 * POST /api/v1/admin/backfill-customer-links
 *
 * 全案件の customerId + businessId から未作成の CustomerBusinessLink を一括作成する。
 * admin 専用・一回限りのバックフィル用エンドポイント。
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { role: string };
    if (user.role !== 'admin') throw ApiError.forbidden();

    // 全アクティブ案件から重複なしの customerId + businessId ペアを取得
    const pairs = await prisma.project.findMany({
      where: { projectIsActive: true },
      select: { customerId: true, businessId: true },
      distinct: ['customerId', 'businessId'],
    });

    let created = 0;
    let skipped = 0;

    for (const { customerId, businessId } of pairs) {
      const existing = await prisma.customerBusinessLink.findUnique({
        where: { customerId_businessId: { customerId, businessId } },
      });
      if (existing) {
        skipped++;
        continue;
      }
      await prisma.customerBusinessLink.create({
        data: { customerId, businessId, linkStatus: 'active' },
      });
      created++;
    }

    return NextResponse.json({
      success: true,
      data: {
        totalPairs: pairs.length,
        created,
        skipped,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
