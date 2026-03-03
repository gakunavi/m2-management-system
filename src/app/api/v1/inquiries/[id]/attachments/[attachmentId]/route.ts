import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { getStorageAdapter } from '@/lib/storage';

// ============================================
// DELETE /api/v1/inquiries/:id/attachments/:attachmentId
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
    const inquiryId = parseInt(id, 10);
    const attachmentIdInt = parseInt(attachmentId, 10);

    const attachment = await prisma.inquiryAttachment.findUnique({
      where: { id: attachmentIdInt },
    });

    if (!attachment || attachment.inquiryId !== inquiryId) {
      throw ApiError.notFound('添付ファイルが見つかりません');
    }

    const storage = getStorageAdapter();
    await storage.delete(attachment.attachmentStorageKey);

    await prisma.inquiryAttachment.delete({ where: { id: attachmentIdInt } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
