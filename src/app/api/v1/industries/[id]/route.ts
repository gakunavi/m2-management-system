import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

// ============================================
// 入力バリデーションスキーマ
// ============================================

const updateIndustrySchema = z.object({
  industryName: z.string().min(1).max(100).optional(),
  displayOrder: z.number().int().min(0).optional(),
});

// ============================================
// PATCH /api/v1/industries/:id
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

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true },
    });
    if (!dbUser) throw ApiError.unauthorized('セッションが無効です。再ログインしてください。');

    const { id } = await params;
    const industryId = parseInt(id, 10);
    if (isNaN(industryId)) throw ApiError.notFound('業種が見つかりません');

    const current = await prisma.industry.findUnique({ where: { id: industryId } });
    if (!current) throw ApiError.notFound('業種が見つかりません');

    const body = await request.json();
    const data = updateIndustrySchema.parse(body);

    // 名前変更時の重複チェック
    if (data.industryName && data.industryName !== current.industryName) {
      const existing = await prisma.industry.findUnique({
        where: { industryName: data.industryName },
      });
      if (existing) {
        throw ApiError.conflict(`業種「${data.industryName}」は既に存在します。`);
      }
    }

    const updated = await prisma.industry.update({
      where: { id: industryId },
      data,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// DELETE /api/v1/industries/:id  (論理削除)
// ============================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true },
    });
    if (!dbUser) throw ApiError.unauthorized('セッションが無効です。再ログインしてください。');

    const { id } = await params;
    const industryId = parseInt(id, 10);
    if (isNaN(industryId)) throw ApiError.notFound('業種が見つかりません');

    const current = await prisma.industry.findUnique({
      where: { id: industryId },
      include: { _count: { select: { customers: { where: { customerIsActive: true } } } } },
    });
    if (!current || !current.isActive) throw ApiError.notFound('業種が見つかりません');

    // 使用中チェック
    if (current._count.customers > 0) {
      throw ApiError.conflict(
        `この業種は ${current._count.customers} 件の顧客で使用中のため削除できません。`,
      );
    }

    await prisma.industry.update({
      where: { id: industryId },
      data: { isActive: false },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
