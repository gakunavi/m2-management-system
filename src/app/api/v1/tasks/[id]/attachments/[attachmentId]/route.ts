import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { getStorageAdapter } from '@/lib/storage';

export const dynamic = 'force-dynamic';

// ============================================
// GET /api/v1/tasks/[id]/attachments/[attachmentId]
// ============================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id, attachmentId } = await params;
    const taskId = parseInt(id, 10);
    const attId = parseInt(attachmentId, 10);

    if (isNaN(taskId)) throw ApiError.notFound('タスクが見つかりません');
    if (isNaN(attId)) throw ApiError.notFound('添付ファイルが見つかりません');

    const attachment = await prisma.taskAttachment.findUnique({
      where: { id: attId },
      include: {
        uploadedBy: { select: { userName: true } },
      },
    });

    if (!attachment) throw ApiError.notFound('添付ファイルが見つかりません');
    if (attachment.taskId !== taskId) throw ApiError.notFound('添付ファイルが見つかりません');

    return NextResponse.json({
      success: true,
      data: {
        id: attachment.id,
        fileName: attachment.fileName,
        fileKey: attachment.fileKey,
        fileSize: attachment.fileSize,
        mimeType: attachment.mimeType,
        uploadedById: attachment.uploadedById,
        uploaderName: attachment.uploadedBy?.userName ?? '',
        createdAt: attachment.createdAt.toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// DELETE /api/v1/tasks/[id]/attachments/[attachmentId]
// ============================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id, attachmentId } = await params;
    const taskId = parseInt(id, 10);
    const attId = parseInt(attachmentId, 10);

    if (isNaN(taskId)) throw ApiError.notFound('タスクが見つかりません');
    if (isNaN(attId)) throw ApiError.notFound('添付ファイルが見つかりません');

    const attachment = await prisma.taskAttachment.findUnique({
      where: { id: attId },
      select: { id: true, taskId: true, fileKey: true, uploadedById: true },
    });

    if (!attachment) throw ApiError.notFound('添付ファイルが見つかりません');
    if (attachment.taskId !== taskId) throw ApiError.notFound('添付ファイルが見つかりません');

    // アップロード者または admin のみ削除可能
    if (user.role !== 'admin' && attachment.uploadedById !== user.id) {
      throw ApiError.forbidden('添付ファイルのアップロード者または管理者のみ削除できます');
    }

    const storage = getStorageAdapter();

    // ストレージからファイルを削除してから DB レコードを削除
    await storage.delete(attachment.fileKey);
    await prisma.taskAttachment.delete({ where: { id: attId } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
