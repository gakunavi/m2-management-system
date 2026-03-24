import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { formatBusiness } from '@/lib/format-business';
import { getBusinessIdsForUser } from '@/lib/revenue-helpers';

// ============================================
// 入力バリデーションスキーマ
// ============================================

const updateBusinessSchema = z.object({
  businessCode: z.string().min(1).max(20).optional(),
  businessName: z.string().min(1).max(100).optional(),
  businessDescription: z.string().optional().nullable(),
  businessConfig: z.record(z.unknown()).optional(),
  businessSortOrder: z.number().int().min(0).optional(),
  businessIsActive: z.boolean().optional(),
  version: z.number().int().min(1),
});

// ============================================
// GET /api/v1/businesses/:id
// ============================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string; partnerId?: number | null };
    const { id } = await params;
    const businessId = parseInt(id, 10);
    if (isNaN(businessId)) throw ApiError.notFound('事業が見つかりません');

    // staff スコープチェック
    const businessIds = await getBusinessIdsForUser(prisma, user);
    if (businessIds && !businessIds.includes(businessId)) {
      throw ApiError.forbidden('この事業へのアクセス権限がありません');
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) throw ApiError.notFound('事業が見つかりません');

    return NextResponse.json({ success: true, data: formatBusiness(business) });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// PATCH /api/v1/businesses/:id
// ============================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string; partnerId?: number | null };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true },
    });
    if (!dbUser) throw ApiError.unauthorized('セッションが無効です。再ログインしてください。');

    const { id } = await params;
    const businessId = parseInt(id, 10);
    if (isNaN(businessId)) throw ApiError.notFound('事業が見つかりません');

    // staff スコープチェック
    const businessIds = await getBusinessIdsForUser(prisma, user);
    if (businessIds && !businessIds.includes(businessId)) {
      throw ApiError.forbidden('この事業へのアクセス権限がありません');
    }

    const body = await request.json();
    const data = updateBusinessSchema.parse(body);

    // 楽観的ロック確認
    const current = await prisma.business.findUnique({
      where: { id: businessId },
      select: { version: true, businessIsActive: true },
    });
    if (!current) throw ApiError.notFound('事業が見つかりません');
    if (!current.businessIsActive) throw ApiError.notFound('事業が見つかりません');
    if (current.version !== data.version) {
      throw ApiError.conflict('他のユーザーによって更新されています。画面をリロードしてください。');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { version: _version, businessConfig: newBusinessConfig, ...updateData } = data;

    // businessConfig のディープマージ（既存キーを保持）
    let mergedConfig = undefined;
    if (newBusinessConfig !== undefined) {
      const currentFull = await prisma.business.findUnique({
        where: { id: businessId },
        select: { businessConfig: true },
      });
      const existingFull = (currentFull?.businessConfig ?? {}) as Record<string, unknown>;
      mergedConfig = { ...existingFull, ...newBusinessConfig };
    }

    const updated = await prisma.business.update({
      where: { id: businessId },
      data: {
        ...updateData,
        ...(mergedConfig !== undefined ? { businessConfig: mergedConfig as import('@prisma/client').Prisma.InputJsonValue } : {}),
        version: { increment: 1 },
        updatedBy: user.id,
      },
    });

    return NextResponse.json({ success: true, data: formatBusiness(updated) });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// DELETE /api/v1/businesses/:id  (論理削除)
// ============================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string; partnerId?: number | null };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true },
    });
    if (!dbUser) throw ApiError.unauthorized('セッションが無効です。再ログインしてください。');

    const { id } = await params;
    const businessId = parseInt(id, 10);
    if (isNaN(businessId)) throw ApiError.notFound('事業が見つかりません');

    // staff スコープチェック
    const delBusinessIds = await getBusinessIdsForUser(prisma, user);
    if (delBusinessIds && !delBusinessIds.includes(businessId)) {
      throw ApiError.forbidden('この事業へのアクセス権限がありません');
    }

    const current = await prisma.business.findUnique({
      where: { id: businessId },
      select: { businessIsActive: true },
    });
    if (!current || !current.businessIsActive) throw ApiError.notFound('事業が見つかりません');

    await prisma.business.update({
      where: { id: businessId },
      data: {
        businessIsActive: false,
        version: { increment: 1 },
        updatedBy: user.id,
      },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
