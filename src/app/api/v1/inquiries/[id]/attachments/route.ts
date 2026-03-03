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

// ============================================
// POST /api/v1/inquiries/:id/attachments
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
    const inquiryId = parseInt(id, 10);

    const inquiry = await prisma.inquiry.findUnique({
      where: { id: inquiryId },
      select: { id: true },
    });
    if (!inquiry) throw ApiError.notFound('問い合わせが見つかりません');

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      throw new ApiError('VALIDATION_ERROR', 'ファイルが指定されていません', 400);
    }

    // ファイルサイズ検証
    if (file.size > MAX_FILE_SIZE) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'ファイルサイズが上限（10MB）を超えています',
        400,
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const storage = getStorageAdapter();
    const result = await storage.upload(
      buffer,
      file.name,
      file.type,
      `inquiry-attachments/${inquiryId}`,
    );

    const created = await prisma.inquiryAttachment.create({
      data: {
        inquiryId,
        attachmentName: file.name,
        attachmentOriginalName: file.name,
        attachmentStorageKey: result.key,
        attachmentUrl: result.url,
        attachmentSize: file.size,
        attachmentMimeType: file.type,
        uploadedBy: user.id,
      },
      include: {
        uploader: { select: { id: true, userName: true } },
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: created.id,
          inquiryId: created.inquiryId,
          attachmentName: created.attachmentName,
          attachmentOriginalName: created.attachmentOriginalName,
          attachmentStorageKey: created.attachmentStorageKey,
          attachmentUrl: created.attachmentUrl,
          attachmentSize: created.attachmentSize,
          attachmentMimeType: created.attachmentMimeType,
          uploadedBy: created.uploadedBy,
          createdAt: created.createdAt.toISOString(),
          uploader: created.uploader,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
