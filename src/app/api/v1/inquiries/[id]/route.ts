import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { inquiryUpdateSchema } from '@/lib/validations/inquiry';

const PARTNER_ROLES = ['partner_admin', 'partner_staff'];

const INQUIRY_DETAIL_INCLUDE = {
  business: { select: { id: true, businessName: true } },
  category: { select: { id: true, categoryName: true } },
  creator: { select: { id: true, userName: true } },
  assignedUser: { select: { id: true, userName: true } },
  respondedByUser: { select: { id: true, userName: true } },
  convertedQa: { select: { id: true, itemTitle: true } },
  attachments: true,
  project: { select: { id: true, projectNo: true } },
} as const;

// ============================================
// GET /api/v1/inquiries/:id
// ============================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    const { id } = await params;
    const inquiryId = parseInt(id, 10);

    const inquiry = await prisma.inquiry.findUnique({
      where: { id: inquiryId },
      include: INQUIRY_DETAIL_INCLUDE,
    });

    if (!inquiry) throw ApiError.notFound('問い合わせが見つかりません');

    // パートナーロールは自分の問い合わせのみ閲覧可能
    if (PARTNER_ROLES.includes(user.role) && inquiry.createdBy !== user.id) {
      throw ApiError.forbidden();
    }

    return NextResponse.json({
      success: true,
      data: {
        id: inquiry.id,
        inquirySubject: inquiry.inquirySubject,
        inquiryBody: inquiry.inquiryBody,
        inquiryStatus: inquiry.inquiryStatus,
        inquiryBusinessId: inquiry.inquiryBusinessId,
        inquiryCategoryId: inquiry.inquiryCategoryId,
        inquiryProjectId: inquiry.inquiryProjectId,
        inquiryAssignedUserId: inquiry.inquiryAssignedUserId,
        inquiryResponse: inquiry.inquiryResponse,
        inquiryRespondedAt: inquiry.inquiryRespondedAt?.toISOString() ?? null,
        inquiryRespondedBy: inquiry.inquiryRespondedBy,
        inquiryIsConvertedToQa: inquiry.inquiryIsConvertedToQa,
        inquiryConvertedQaId: inquiry.inquiryConvertedQaId,
        createdBy: inquiry.createdBy,
        createdAt: inquiry.createdAt.toISOString(),
        updatedAt: inquiry.updatedAt.toISOString(),
        business: inquiry.business,
        category: inquiry.category,
        creator: inquiry.creator,
        assignedUser: inquiry.assignedUser,
        respondedByUser: inquiry.respondedByUser,
        convertedQa: inquiry.convertedQa,
        project: inquiry.project,
        attachments: inquiry.attachments.map((a) => ({
          id: a.id,
          inquiryId: a.inquiryId,
          attachmentName: a.attachmentName,
          attachmentOriginalName: a.attachmentOriginalName,
          attachmentStorageKey: a.attachmentStorageKey,
          attachmentUrl: a.attachmentUrl,
          attachmentSize: a.attachmentSize,
          attachmentMimeType: a.attachmentMimeType,
          uploadedBy: a.uploadedBy,
          createdAt: a.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// PATCH /api/v1/inquiries/:id
// ============================================

export async function PATCH(
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
      select: { id: true, inquiryStatus: true },
    });
    if (!existing) throw ApiError.notFound('問い合わせが見つかりません');

    const body = await request.json();
    const data = inquiryUpdateSchema.parse(body);

    // 担当者がアサインされ、かつステータスが 'new' の場合は 'in_progress' に自動更新
    let resolvedStatus = data.inquiryStatus;
    if (
      data.inquiryAssignedUserId !== undefined &&
      data.inquiryAssignedUserId !== null &&
      existing.inquiryStatus === 'new' &&
      resolvedStatus === undefined
    ) {
      resolvedStatus = 'in_progress';
    }

    const updated = await prisma.inquiry.update({
      where: { id: inquiryId },
      data: {
        ...(resolvedStatus !== undefined && { inquiryStatus: resolvedStatus }),
        ...(data.inquiryCategoryId !== undefined && { inquiryCategoryId: data.inquiryCategoryId }),
        ...(data.inquiryAssignedUserId !== undefined && { inquiryAssignedUserId: data.inquiryAssignedUserId }),
        updatedAt: new Date(),
      },
      include: INQUIRY_DETAIL_INCLUDE,
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
        convertedQa: updated.convertedQa,
        project: updated.project,
        attachments: updated.attachments.map((a) => ({
          id: a.id,
          inquiryId: a.inquiryId,
          attachmentName: a.attachmentName,
          attachmentOriginalName: a.attachmentOriginalName,
          attachmentStorageKey: a.attachmentStorageKey,
          attachmentUrl: a.attachmentUrl,
          attachmentSize: a.attachmentSize,
          attachmentMimeType: a.attachmentMimeType,
          uploadedBy: a.uploadedBy,
          createdAt: a.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// DELETE /api/v1/inquiries/:id
// ============================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (user.role !== 'admin') throw ApiError.forbidden();

    const { id } = await params;
    const inquiryId = parseInt(id, 10);

    const existing = await prisma.inquiry.findUnique({
      where: { id: inquiryId },
      select: { id: true },
    });
    if (!existing) throw ApiError.notFound('問い合わせが見つかりません');

    await prisma.inquiry.delete({ where: { id: inquiryId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
