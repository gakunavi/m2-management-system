import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { qaCategorySchema } from '@/lib/validations/qa';

// ============================================
// PATCH /api/v1/qa/categories/[id]
// ============================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (user.role !== 'admin') throw ApiError.forbidden();

    const { id } = await params;
    const categoryId = parseInt(id, 10);
    if (isNaN(categoryId)) throw ApiError.notFound('カテゴリが見つかりません');

    const current = await prisma.qaCategory.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!current) throw ApiError.notFound('カテゴリが見つかりません');

    const body = await request.json();
    const data = qaCategorySchema.partial().parse(body);

    const updated = await prisma.qaCategory.update({
      where: { id: categoryId },
      data: {
        ...(data.categoryName !== undefined && { categoryName: data.categoryName }),
        ...(data.categoryDescription !== undefined && { categoryDescription: data.categoryDescription ?? null }),
        ...(data.categorySortOrder !== undefined && { categorySortOrder: data.categorySortOrder }),
        ...(data.categoryIsActive !== undefined && { categoryIsActive: data.categoryIsActive }),
      },
      include: {
        _count: {
          select: { items: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        categoryName: updated.categoryName,
        categoryDescription: updated.categoryDescription,
        categorySortOrder: updated.categorySortOrder,
        categoryIsActive: updated.categoryIsActive,
        itemCount: updated._count.items,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// DELETE /api/v1/qa/categories/[id]  (ソフトデリート)
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
    const categoryId = parseInt(id, 10);
    if (isNaN(categoryId)) throw ApiError.notFound('カテゴリが見つかりません');

    const current = await prisma.qaCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, categoryIsActive: true },
    });
    if (!current) throw ApiError.notFound('カテゴリが見つかりません');
    if (!current.categoryIsActive) throw ApiError.notFound('カテゴリが見つかりません');

    await prisma.qaCategory.update({
      where: { id: categoryId },
      data: { categoryIsActive: false },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
