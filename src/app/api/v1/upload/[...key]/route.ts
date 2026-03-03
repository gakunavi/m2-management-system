import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { getStorageAdapter } from '@/lib/storage';

// ============================================
// DELETE /api/v1/upload/[...key]
// キーに "/" が含まれるため catch-all ルートを使用
// ============================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { key } = await params;
    const fileKey = key.join('/');

    if (!fileKey) {
      throw new ApiError('VALIDATION_ERROR', 'ファイルキーが指定されていません', 400);
    }

    const storage = getStorageAdapter();
    const fileExists = await storage.exists(fileKey);
    if (!fileExists) {
      throw ApiError.notFound('ファイルが見つかりません');
    }

    await storage.delete(fileKey);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
