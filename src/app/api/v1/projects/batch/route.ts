import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { notifyProjectsChangedToMl } from '@/lib/ml-scope';
import { userActor } from '@/lib/update-actor';

const batchSchema = z.object({
  action: z.enum(['delete']),
  ids: z.array(z.number().int().positive()).min(1),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string; userName?: string | null };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const body = await request.json();
    const { action, ids } = batchSchema.parse(body);

    if (action === 'delete') {
      // 実際に消える案件を先に控える（updateMany は対象の行を返さないため、
      // 消したあとでは「もともと消えていた案件」と区別できない）
      const targets = await prisma.project.findMany({
        where: { id: { in: ids }, projectIsActive: true },
        select: { id: true },
      });

      const result = await prisma.project.updateMany({
        where: {
          id: { in: ids },
          projectIsActive: true,
        },
        data: {
          projectIsActive: false,
          updatedBy: user.id,
        },
      });

      // ML へ案件ごとに1通。削除専用の種別は作っていないので project.updated を送り、
      // ML が読み直したときの 404 で「消えた」と分かる
      await notifyProjectsChangedToMl(prisma, userActor(user), targets.map((t) => t.id));

      return NextResponse.json({
        success: true,
        data: { affected: result.count, requested: ids.length },
      });
    }

    throw ApiError.badRequest('サポートされていないアクションです');
  } catch (error) {
    return handleApiError(error);
  }
}
