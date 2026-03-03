import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { getStorageAdapter } from '@/lib/storage';

// ============================================
// 定数
// ============================================

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/zip',
  'application/x-zip-compressed',
];

// ============================================
// POST /api/v1/qa/items/[id]/attachments
// ============================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id } = await params;
    const itemId = parseInt(id, 10);
    if (isNaN(itemId)) throw ApiError.notFound('QAアイテムが見つかりません');

    const item = await prisma.qaItem.findUnique({
      where: { id: itemId },
      select: { id: true },
    });
    if (!item) throw ApiError.notFound('QAアイテムが見つかりません');

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      throw new ApiError('VALIDATION_ERROR', 'ファイルが指定されていません', 400);
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'PDF、Word、Excel、画像（JPEG/PNG/GIF/WebP）、ZIP形式のファイルのみアップロードできます',
        400,
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'ファイルサイズが上限（10MB）を超えています',
        400,
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const storage = getStorageAdapter();
    const directory = `qa-attachments/${itemId}`;
    const result = await storage.upload(buffer, file.name, file.type, directory);

    const attachment = await prisma.qaAttachment.create({
      data: {
        qaItemId: itemId,
        attachmentName: file.name,
        attachmentOriginalName: file.name,
        attachmentStorageKey: result.key,
        attachmentUrl: result.url,
        attachmentSize: file.size,
        attachmentMimeType: file.type,
        uploadedBy: user.id,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: attachment.id,
          qaItemId: attachment.qaItemId,
          attachmentName: attachment.attachmentName,
          attachmentOriginalName: attachment.attachmentOriginalName,
          attachmentUrl: attachment.attachmentUrl,
          attachmentSize: attachment.attachmentSize,
          attachmentMimeType: attachment.attachmentMimeType,
          createdAt: attachment.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
