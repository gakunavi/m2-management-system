import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { qaItemSchema } from '@/lib/validations/qa';
import type { Prisma } from '@prisma/client';

// ============================================
// GET /api/v1/qa/items
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as {
      id: number;
      role: string;
      businesses?: { id: number; businessCode: string; businessName: string }[];
    };
    const isPartnerRole = ['partner_admin', 'partner_staff'].includes(user.role);

    const { searchParams } = request.nextUrl;
    const categoryId = searchParams.get('categoryId');
    const status = searchParams.get('status');
    const search = searchParams.get('search') ?? '';
    const isPublicParam = searchParams.get('isPublic');
    const businessIdParam = searchParams.get('businessId');

    const where: Prisma.QaItemWhereInput = {};

    // 事業スコープフィルタ用の条件
    let businessScopeCondition: Prisma.QaItemWhereInput[] | null = null;

    // パートナーロールは公開済み・公開フラグ立ちのみ参照可能
    if (isPartnerRole) {
      where.itemStatus = 'published';
      where.itemIsPublic = true;

      // partner系は自分のアクセス可能な事業 + 全社共通(null)のみ
      const userBusinessIds = (user.businesses ?? []).map((b) => b.id);

      if (businessIdParam) {
        const bId = parseInt(businessIdParam, 10);
        if (!isNaN(bId) && userBusinessIds.includes(bId)) {
          businessScopeCondition = [
            { businessId: null },
            { businessId: bId },
          ];
        } else {
          businessScopeCondition = [
            { businessId: null },
            { businessId: { in: userBusinessIds } },
          ];
        }
      } else {
        businessScopeCondition = [
          { businessId: null },
          { businessId: { in: userBusinessIds } },
        ];
      }
    } else {
      if (status === 'draft' || status === 'published') {
        where.itemStatus = status;
      }
      if (isPublicParam === 'true') {
        where.itemIsPublic = true;
      } else if (isPublicParam === 'false') {
        where.itemIsPublic = false;
      }

      // admin/staff: 事業フィルタ
      if (businessIdParam) {
        if (businessIdParam === 'common') {
          where.businessId = null;
        } else {
          const bId = parseInt(businessIdParam, 10);
          if (!isNaN(bId)) {
            businessScopeCondition = [
              { businessId: null },
              { businessId: bId },
            ];
          }
        }
      }
    }

    if (categoryId) {
      const categoryIdInt = parseInt(categoryId, 10);
      if (!isNaN(categoryIdInt)) {
        where.categoryId = categoryIdInt;
      }
    }

    // 検索条件と事業スコープ条件を AND で組み合わせ
    const andConditions: Prisma.QaItemWhereInput[] = [];

    if (businessScopeCondition) {
      andConditions.push({ OR: businessScopeCondition });
    }

    if (search) {
      andConditions.push({
        OR: [
          { itemTitle: { contains: search, mode: 'insensitive' } },
          { itemQuestion: { contains: search, mode: 'insensitive' } },
          { itemAnswer: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    const items = await prisma.qaItem.findMany({
      where,
      orderBy: [
        { itemSortOrder: 'asc' },
        { createdAt: 'desc' },
      ],
      include: {
        category: {
          select: { categoryName: true },
        },
        business: {
          select: { id: true, businessName: true },
        },
        creator: {
          select: { id: true, userName: true },
        },
        _count: {
          select: { attachments: true },
        },
      },
    });

    const data = items.map((item) => ({
      id: item.id,
      categoryId: item.categoryId,
      categoryName: item.category.categoryName,
      businessId: item.businessId,
      businessName: item.business?.businessName ?? null,
      itemTitle: item.itemTitle,
      itemQuestion: item.itemQuestion,
      itemAnswer: item.itemAnswer,
      itemStatus: item.itemStatus,
      itemIsPublic: item.itemIsPublic,
      itemViewCount: item.itemViewCount,
      itemSortOrder: item.itemSortOrder,
      itemPublishedAt: item.itemPublishedAt ? item.itemPublishedAt.toISOString() : null,
      attachmentCount: item._count.attachments,
      creator: item.creator
        ? { id: item.creator.id, userName: item.creator.userName }
        : null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// POST /api/v1/qa/items
// ============================================

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const body = await request.json();
    const data = qaItemSchema.parse(body);

    const category = await prisma.qaCategory.findUnique({
      where: { id: data.categoryId },
      select: { id: true, categoryIsActive: true },
    });
    if (!category || !category.categoryIsActive) {
      throw ApiError.notFound('指定されたカテゴリが見つかりません');
    }

    const item = await prisma.qaItem.create({
      data: {
        categoryId: data.categoryId,
        businessId: data.businessId ?? null,
        itemTitle: data.itemTitle,
        itemQuestion: data.itemQuestion,
        itemAnswer: data.itemAnswer,
        itemStatus: data.itemStatus,
        itemIsPublic: data.itemIsPublic,
        itemSortOrder: data.itemSortOrder,
        itemPublishedAt: data.itemStatus === 'published' ? new Date() : null,
        createdBy: user.id,
        updatedBy: user.id,
      },
      include: {
        category: {
          select: { categoryName: true },
        },
        business: {
          select: { id: true, businessName: true },
        },
        creator: {
          select: { id: true, userName: true },
        },
        _count: {
          select: { attachments: true },
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: item.id,
          categoryId: item.categoryId,
          categoryName: item.category.categoryName,
          businessId: item.businessId,
          businessName: item.business?.businessName ?? null,
          itemTitle: item.itemTitle,
          itemQuestion: item.itemQuestion,
          itemAnswer: item.itemAnswer,
          itemStatus: item.itemStatus,
          itemIsPublic: item.itemIsPublic,
          itemViewCount: item.itemViewCount,
          itemSortOrder: item.itemSortOrder,
          itemPublishedAt: item.itemPublishedAt ? item.itemPublishedAt.toISOString() : null,
          attachmentCount: item._count.attachments,
          creator: item.creator
            ? { id: item.creator.id, userName: item.creator.userName }
            : null,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
