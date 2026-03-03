import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { getStorageAdapter } from '@/lib/storage';
import { logger } from '@/lib/logger';

const batchSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1, '対象を1件以上選択してください'),
  action: z.enum(['delete']),
});

// ============================================
// POST /api/v1/partners/batch — 一括操作
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
        // 削除対象のBP申込書キーを事前に収集
        const targets = await prisma.partner.findMany({
          where: { id: { in: ids }, partnerIsActive: true },
          select: { id: true, partnerBpFormKey: true },
        });

        const result = await prisma.partner.updateMany({
          where: {
            id: { in: ids },
            partnerIsActive: true,
          },
          data: {
            partnerIsActive: false,
            updatedBy: user.id,
          },
        });
        count = result.count;

        // BP申込書ファイルをストレージから削除（論理削除後・失敗は無視）
        if (targets.length > 0) {
          const storage = getStorageAdapter();
          await Promise.allSettled(
            targets
              .filter((t) => t.partnerBpFormKey)
              .map((t) =>
                storage.delete(t.partnerBpFormKey!).catch(() => {
                  logger.error(`storage delete failed: ${t.partnerBpFormKey}`, undefined, 'partner batch delete');
                }),
              ),
          );
        }
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
