import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { inquiryCreateSchema } from '@/lib/validations/inquiry';

const PARTNER_ROLES = ['partner_admin', 'partner_staff'];

// ============================================
// GET /api/v1/inquiries
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    const { searchParams } = request.nextUrl;

    const status = searchParams.get('status');
    const businessIdParam = searchParams.get('businessId');
    const categoryIdParam = searchParams.get('categoryId');
    const search = searchParams.get('search') ?? '';
    const assignedUserIdParam = searchParams.get('assignedUserId');

    const where: Record<string, unknown> = {};

    // パートナーロールは自分の問い合わせのみ閲覧可能
    if (PARTNER_ROLES.includes(user.role)) {
      where.createdBy = user.id;
    }

    // 事業フィルター
    if (businessIdParam) {
      where.inquiryBusinessId = parseInt(businessIdParam, 10);
    }

    // ステータスフィルター
    if (status) {
      where.inquiryStatus = status;
    }

    // カテゴリフィルター
    if (categoryIdParam) {
      where.inquiryCategoryId = parseInt(categoryIdParam, 10);
    }

    // 担当者フィルター
    if (assignedUserIdParam) {
      where.inquiryAssignedUserId = parseInt(assignedUserIdParam, 10);
    }

    // テキスト検索
    if (search) {
      where.OR = [
        { inquirySubject: { contains: search, mode: 'insensitive' } },
        { inquiryBody: { contains: search, mode: 'insensitive' } },
      ];
    }

    const inquiries = await prisma.inquiry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        business: { select: { id: true, businessName: true } },
        category: { select: { id: true, categoryName: true } },
        creator: { select: { id: true, userName: true } },
        assignedUser: { select: { id: true, userName: true } },
        _count: { select: { attachments: true } },
      },
    });

    const data = inquiries.map((inquiry) => ({
      id: inquiry.id,
      inquirySubject: inquiry.inquirySubject,
      inquiryBody: inquiry.inquiryBody,
      inquiryStatus: inquiry.inquiryStatus,
      inquiryBusinessId: inquiry.inquiryBusinessId,
      inquiryCategoryId: inquiry.inquiryCategoryId,
      inquiryProjectId: inquiry.inquiryProjectId,
      inquiryAssignedUserId: inquiry.inquiryAssignedUserId,
      inquiryIsConvertedToQa: inquiry.inquiryIsConvertedToQa,
      inquiryConvertedQaId: inquiry.inquiryConvertedQaId,
      createdBy: inquiry.createdBy,
      createdAt: inquiry.createdAt.toISOString(),
      updatedAt: inquiry.updatedAt.toISOString(),
      business: inquiry.business,
      category: inquiry.category,
      creator: inquiry.creator,
      assignedUser: inquiry.assignedUser,
      attachmentCount: inquiry._count.attachments,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// POST /api/v1/inquiries
// ============================================

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };

    const body = await request.json();
    const data = inquiryCreateSchema.parse(body);

    const created = await prisma.inquiry.create({
      data: {
        inquirySubject: data.inquirySubject,
        inquiryBody: data.inquiryBody,
        inquiryStatus: 'new',
        inquiryBusinessId: data.inquiryBusinessId ?? null,
        inquiryCategoryId: data.inquiryCategoryId ?? null,
        inquiryProjectId: data.inquiryProjectId ?? null,
        createdBy: user.id,
      },
      include: {
        category: { select: { id: true, categoryName: true } },
        creator: { select: { id: true, userName: true } },
        assignedUser: { select: { id: true, userName: true } },
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: created.id,
          inquirySubject: created.inquirySubject,
          inquiryBody: created.inquiryBody,
          inquiryStatus: created.inquiryStatus,
          inquiryCategoryId: created.inquiryCategoryId,
          inquiryProjectId: created.inquiryProjectId,
          inquiryAssignedUserId: created.inquiryAssignedUserId,
          inquiryIsConvertedToQa: created.inquiryIsConvertedToQa,
          inquiryConvertedQaId: created.inquiryConvertedQaId,
          createdBy: created.createdBy,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString(),
          category: created.category,
          creator: created.creator,
          assignedUser: created.assignedUser,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
