import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

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

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const body = await request.json();
    const { ids, action } = batchSchema.parse(body);

    let count = 0;

    switch (action) {
      case 'delete': {
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
