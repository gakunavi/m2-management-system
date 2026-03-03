import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { inquiryConvertToQaSchema } from '@/lib/validations/inquiry';

// ============================================
// POST /api/v1/inquiries/:id/convert-to-qa
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
      select: {
        id: true,
        inquiryBody: true,
        inquiryResponse: true,
        inquiryIsConvertedToQa: true,
        inquiryBusinessId: true,
      },
    });
    if (!inquiry) throw ApiError.notFound('問い合わせが見つかりません');

    // 回答が存在しない場合は変換不可
    if (!inquiry.inquiryResponse) {
      throw ApiError.badRequest('Q&Aに変換するには先に回答が必要です');
    }

    // 既に変換済みの場合はエラー
    if (inquiry.inquiryIsConvertedToQa) {
      throw ApiError.conflict('この問い合わせは既にQ&Aに変換されています');
    }

    const body = await request.json();
    const data = inquiryConvertToQaSchema.parse(body);

    // トランザクションで QaItem 作成 + Inquiry 更新をアトミックに実行
    const qaItem = await prisma.$transaction(async (tx) => {
      const created = await tx.qaItem.create({
        data: {
          categoryId: data.categoryId,
          businessId: inquiry.inquiryBusinessId ?? null,
          itemTitle: data.itemTitle,
          itemQuestion: inquiry.inquiryBody,
          itemAnswer: inquiry.inquiryResponse!,
          itemStatus: 'draft',
          itemIsPublic: data.itemIsPublic,
          createdBy: user.id,
          updatedBy: user.id,
        },
      });

      await tx.inquiry.update({
        where: { id: inquiryId },
        data: {
          inquiryIsConvertedToQa: true,
          inquiryConvertedQaId: created.id,
          inquiryStatus: 'converted_to_qa',
          updatedAt: new Date(),
        },
      });

      return created;
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: qaItem.id,
          categoryId: qaItem.categoryId,
          itemTitle: qaItem.itemTitle,
          itemQuestion: qaItem.itemQuestion,
          itemAnswer: qaItem.itemAnswer,
          itemStatus: qaItem.itemStatus,
          itemIsPublic: qaItem.itemIsPublic,
          itemViewCount: qaItem.itemViewCount,
          itemSortOrder: qaItem.itemSortOrder,
          itemPublishedAt: qaItem.itemPublishedAt?.toISOString() ?? null,
          createdBy: qaItem.createdBy,
          updatedBy: qaItem.updatedBy,
          createdAt: qaItem.createdAt.toISOString(),
          updatedAt: qaItem.updatedAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
