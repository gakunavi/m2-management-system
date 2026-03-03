import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { qaCategorySchema } from '@/lib/validations/qa';
import type { Prisma } from '@prisma/client';

// ============================================
// GET /api/v1/qa/categories
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as {
      id: number;
      role: string;
      businesses?: { id: number }[];
    };
    const isPartnerRole = ['partner_admin', 'partner_staff'].includes(user.role);

    const { searchParams } = request.nextUrl;
    const businessIdParam = searchParams.get('businessId');

    const where = isPartnerRole
      ? { categoryIsActive: true }
      : {};

    // アイテム数のフィルター条件を構築
    const itemCountWhere: Prisma.QaItemWhereInput = {};

    if (isPartnerRole) {
      itemCountWhere.itemStatus = 'published';
      itemCountWhere.itemIsPublic = true;
      const userBusinessIds = (user.businesses ?? []).map((b) => b.id);

      if (businessIdParam) {
        const bId = parseInt(businessIdParam, 10);
        if (!isNaN(bId) && userBusinessIds.includes(bId)) {
          itemCountWhere.OR = [
            { businessId: null },
            { businessId: bId },
          ];
        } else {
          itemCountWhere.OR = [
            { businessId: null },
            { businessId: { in: userBusinessIds } },
          ];
        }
      } else {
        itemCountWhere.OR = [
          { businessId: null },
          { businessId: { in: userBusinessIds } },
        ];
      }
    } else if (businessIdParam) {
      if (businessIdParam === 'common') {
        itemCountWhere.businessId = null;
      } else {
        const bId = parseInt(businessIdParam, 10);
        if (!isNaN(bId)) {
          itemCountWhere.OR = [
            { businessId: null },
            { businessId: bId },
          ];
        }
      }
    }

    const hasItemCountFilter = Object.keys(itemCountWhere).length > 0;

    const categories = await prisma.qaCategory.findMany({
      where,
      orderBy: { categorySortOrder: 'asc' },
      include: {
        _count: {
          select: {
            items: hasItemCountFilter ? { where: itemCountWhere } : true,
          },
        },
      },
    });

    const data = categories.map((cat) => ({
      id: cat.id,
      categoryName: cat.categoryName,
      categoryDescription: cat.categoryDescription,
      categorySortOrder: cat.categorySortOrder,
      categoryIsActive: cat.categoryIsActive,
      itemCount: cat._count.items,
      createdAt: cat.createdAt.toISOString(),
      updatedAt: cat.updatedAt.toISOString(),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// POST /api/v1/qa/categories
// ============================================

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (user.role !== 'admin') throw ApiError.forbidden();

    const body = await request.json();
    const data = qaCategorySchema.parse(body);

    const category = await prisma.qaCategory.create({
      data: {
        categoryName: data.categoryName,
        categoryDescription: data.categoryDescription ?? null,
        categorySortOrder: data.categorySortOrder,
        categoryIsActive: data.categoryIsActive,
        createdBy: user.id,
      },
      include: {
        _count: {
          select: { items: true },
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: category.id,
          categoryName: category.categoryName,
          categoryDescription: category.categoryDescription,
          categorySortOrder: category.categorySortOrder,
          categoryIsActive: category.categoryIsActive,
          itemCount: category._count.items,
          createdAt: category.createdAt.toISOString(),
          updatedAt: category.updatedAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
