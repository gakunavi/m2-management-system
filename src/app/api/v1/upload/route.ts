import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { getStorageAdapter } from '@/lib/storage';

// ============================================
// 定数
// ============================================

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

// ============================================
// POST /api/v1/upload
// ============================================

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const directory = (formData.get('directory') as string | null) ?? 'general';

    if (!file) {
      throw new ApiError('VALIDATION_ERROR', 'ファイルが指定されていません', 400);
    }

    // MIME タイプ検証
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'JPEG、PNG、WebP、PDF 形式のファイルのみアップロードできます',
        400,
      );
    }

    // サイズ検証
    if (file.size > MAX_FILE_SIZE) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'ファイルサイズが上限（5MB）を超えています',
        400,
      );
    }

    // directory のサニタイズ（パストラバーサル防止）
    const safeDirectory = directory.replace(/[^a-zA-Z0-9\-_]/g, '') || 'general';

    const buffer = Buffer.from(await file.arrayBuffer());
    const storage = getStorageAdapter();
    const result = await storage.upload(buffer, file.name, file.type, safeDirectory);

    return NextResponse.json(
      {
        success: true,
        data: {
          key: result.key,
          url: result.url,
          filename: file.name,
          size: file.size,
          contentType: file.type,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
