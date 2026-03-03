import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { inquiryResponseSchema } from '@/lib/validations/inquiry';

// ============================================
// POST /api/v1/inquiries/:id/respond
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

    const existing = await prisma.inquiry.findUnique({
      where: { id: inquiryId },
      select: { id: true },
    });
    if (!existing) throw ApiError.notFound('問い合わせが見つかりません');

    const body = await request.json();
    const data = inquiryResponseSchema.parse(body);

    const updated = await prisma.inquiry.update({
      where: { id: inquiryId },
      data: {
        inquiryResponse: data.inquiryResponse,
        inquiryRespondedAt: new Date(),
        inquiryRespondedBy: user.id,
        inquiryStatus: 'resolved',
        updatedAt: new Date(),
      },
      include: {
        category: { select: { id: true, categoryName: true } },
        creator: { select: { id: true, userName: true } },
        assignedUser: { select: { id: true, userName: true } },
        respondedByUser: { select: { id: true, userName: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        inquirySubject: updated.inquirySubject,
        inquiryBody: updated.inquiryBody,
        inquiryStatus: updated.inquiryStatus,
        inquiryCategoryId: updated.inquiryCategoryId,
        inquiryProjectId: updated.inquiryProjectId,
        inquiryAssignedUserId: updated.inquiryAssignedUserId,
        inquiryResponse: updated.inquiryResponse,
        inquiryRespondedAt: updated.inquiryRespondedAt?.toISOString() ?? null,
        inquiryRespondedBy: updated.inquiryRespondedBy,
        inquiryIsConvertedToQa: updated.inquiryIsConvertedToQa,
        inquiryConvertedQaId: updated.inquiryConvertedQaId,
        createdBy: updated.createdBy,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        category: updated.category,
        creator: updated.creator,
        assignedUser: updated.assignedUser,
        respondedByUser: updated.respondedByUser,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
