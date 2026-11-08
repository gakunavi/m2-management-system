import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { notifyCustomersChangedToMl } from '@/lib/ml-scope';
import { userActor } from '@/lib/update-actor';

const batchSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1, '対象を1件以上選択してください'),
  action: z.enum(['delete']),
});

// ============================================
// POST /api/v1/customers/batch — 一括操作
// ============================================

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string; userName?: string | null };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const body = await request.json();
    const { ids, action } = batchSchema.parse(body);

    let count = 0;

    switch (action) {
      case 'delete': {
        // 実際に消える顧客を先に控える（updateMany は対象の行を返さない）
        const targets = await prisma.customer.findMany({
          where: { id: { in: ids }, customerIsActive: true },
          select: { id: true },
        });

        const result = await prisma.customer.updateMany({
          where: {
            id: { in: ids },
            customerIsActive: true,
          },
          data: {
            customerIsActive: false,
            updatedBy: user.id,
          },
        });
        count = result.count;

        // ML へ顧客ごとに1通
        await notifyCustomersChangedToMl(prisma, userActor(user), {
          customerIds: targets.map((t) => t.id),
          kind: 'customer',
        });
        break;
      }

    }

    return NextResponse.json({
      success: true,
      data: { action, requested: ids.length, affected: count },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
