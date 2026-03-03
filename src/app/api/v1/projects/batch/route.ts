import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

const batchSchema = z.object({
  action: z.enum(['delete']),
  ids: z.array(z.number().int().positive()).min(1),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const body = await request.json();
    const { action, ids } = batchSchema.parse(body);

    if (action === 'delete') {
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
