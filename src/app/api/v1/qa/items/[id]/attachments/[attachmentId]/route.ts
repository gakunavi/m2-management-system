import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { getStorageAdapter } from '@/lib/storage';

// ============================================
// DELETE /api/v1/qa/items/[id]/attachments/[attachmentId]
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
    const itemId = parseInt(id, 10);
    const attId = parseInt(attachmentId, 10);

    if (isNaN(itemId)) throw ApiError.notFound('QAアイテムが見つかりません');
    if (isNaN(attId)) throw ApiError.notFound('添付ファイルが見つかりません');

    const attachment = await prisma.qaAttachment.findUnique({
      where: { id: attId },
      select: { id: true, qaItemId: true, attachmentStorageKey: true },
    });

    if (!attachment) throw ApiError.notFound('添付ファイルが見つかりません');
    if (attachment.qaItemId !== itemId) throw ApiError.notFound('添付ファイルが見つかりません');

    const storage = getStorageAdapter();

    // ストレージからファイルを削除
    await storage.delete(attachment.attachmentStorageKey);

    // DBレコードを削除
    await prisma.qaAttachment.delete({ where: { id: attId } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
