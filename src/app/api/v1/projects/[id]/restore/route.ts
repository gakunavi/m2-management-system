import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (user.role !== 'admin') throw ApiError.forbidden('管理者のみ復元できます');

    const { id } = await params;
    const projectId = parseInt(id, 10);

    const existing = await prisma.project.findUnique({ where: { id: projectId } });
    if (!existing) throw ApiError.notFound('案件が見つかりません');
    if (existing.projectIsActive) throw ApiError.badRequest('この案件は削除されていません');

    await prisma.project.update({
      where: { id: projectId },
      data: { projectIsActive: true, updatedBy: user.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
