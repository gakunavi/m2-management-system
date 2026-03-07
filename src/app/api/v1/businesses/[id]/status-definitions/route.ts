import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

const createSchema = z.object({
  statusCode: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_]+$/, '英数字とアンダースコアのみ使用できます'),
  statusLabel: z.string().min(1).max(100),
  statusPriority: z.number().int().min(0),
  statusColor: z.string().max(20).optional().nullable(),
  statusIsFinal: z.boolean().default(false),
  statusIsLost: z.boolean().default(false),
});

// ============================================
// GET /api/v1/businesses/:id/status-definitions
// ============================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const { id } = await params;
    const businessId = parseInt(id, 10);
    if (isNaN(businessId)) throw ApiError.notFound('事業が見つかりません');

    const items = await prisma.businessStatusDefinition.findMany({
      where: { businessId },
      orderBy: { statusSortOrder: 'asc' },
    });

    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// POST /api/v1/businesses/:id/status-definitions
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
    const businessId = parseInt(id, 10);
    if (isNaN(businessId)) throw ApiError.notFound('事業が見つかりません');

    // 事業の存在確認
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, businessIsActive: true },
    });
    if (!business || !business.businessIsActive) throw ApiError.notFound('事業が見つかりません');

    const body = await request.json();
    const data = createSchema.parse(body);

    // statusCode の事業内一意チェック
    const existing = await prisma.businessStatusDefinition.findFirst({
      where: { businessId, statusCode: data.statusCode },
    });
    if (existing) {
      throw ApiError.conflict('このステータスコードはすでに使用されています');
    }

    // 既存最大 statusSortOrder + 1
    const maxSort = await prisma.businessStatusDefinition.aggregate({
      where: { businessId },
      _max: { statusSortOrder: true },
    });
    const nextSortOrder = (maxSort._max.statusSortOrder ?? -1) + 1;

    // statusIsFinal / statusIsLost は複数設定可能（制約なし）
    const created = await prisma.businessStatusDefinition.create({
      data: {
        businessId,
        ...data,
        statusSortOrder: nextSortOrder,
        statusIsActive: true,
      },
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
