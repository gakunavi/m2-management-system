import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

// ============================================
// 入力バリデーションスキーマ
// ============================================

const createIndustrySchema = z.object({
  industryName: z.string().min(1).max(100),
  displayOrder: z.number().int().min(0).optional().default(0),
});

// ============================================
// GET /api/v1/industries
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const industries = await prisma.industry.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { industryName: 'asc' }],
    });

    return NextResponse.json({ success: true, data: industries });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// POST /api/v1/industries
// ============================================

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const data = createIndustrySchema.parse(body);

    // 名前重複チェック
    const existing = await prisma.industry.findUnique({
      where: { industryName: data.industryName },
    });
    if (existing) {
      throw ApiError.conflict(`業種「${data.industryName}」は既に存在します。`);
    }

    const industry = await prisma.industry.create({
      data: {
        industryName: data.industryName,
        displayOrder: data.displayOrder,
      },
    });

    return NextResponse.json({ success: true, data: industry }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
