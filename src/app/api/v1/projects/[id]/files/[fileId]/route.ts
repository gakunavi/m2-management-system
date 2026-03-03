import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { getStorageAdapter } from '@/lib/storage';

// ============================================
// DELETE /api/v1/projects/:id/files/:fileId
// ============================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id, fileId } = await params;
    const projectId = parseInt(id, 10);
    const fileIdInt = parseInt(fileId, 10);

    const file = await prisma.projectFile.findUnique({
      where: { id: fileIdInt },
    });

    if (!file || file.projectId !== projectId) {
      throw ApiError.notFound('ファイルが見つかりません');
    }

    const storage = getStorageAdapter();
    await storage.delete(file.fileStorageKey);

    await prisma.projectFile.delete({ where: { id: fileIdInt } });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
