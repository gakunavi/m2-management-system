import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { getBusinessIdsForUser } from '@/lib/revenue-helpers';

// ============================================
// バリデーション
// ============================================

const createAnnouncementSchema = z.object({
  title: z.string().min(1, 'タイトルは必須です').max(200),
  content: z.string().min(1, '本文は必須です'),
  priority: z.enum(['normal', 'important', 'urgent']).optional().default('normal'),
  targetScope: z.enum(['internal', 'all']).optional().default('internal'),
  businessId: z.number().int().nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
});

// ============================================
// GET /api/v1/announcements
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string; partnerId?: number | null };
    const { searchParams } = request.nextUrl;
    const includeAll = searchParams.get('includeAll') === 'true';
    const isManager = ['admin', 'staff'].includes(user.role);

    const now = new Date();

    // 管理者が includeAll=true → 全件（管理画面用）
    // それ以外 → 公開中のみ
    const baseWhere = isManager && includeAll
      ? {}
      : {
          publishedAt: { not: null, lte: now },
          OR: [
            { expiresAt: null },
            { expiresAt: { gte: now } },
          ],
        };

    // スコープフィルタ
    const isPartner = user.role === 'partner_admin' || user.role === 'partner_staff';
    const scopeWhere = isPartner
      ? { targetScope: 'all' }
      : {};

    // 事業スコープ
    const businessIds = await getBusinessIdsForUser(prisma, user);
    const businessWhere = businessIds
      ? { OR: [{ businessId: null }, { businessId: { in: businessIds } }] }
      : {};

    const announcements = await prisma.announcement.findMany({
      where: {
        ...baseWhere,
        ...scopeWhere,
        ...businessWhere,
      },
      include: {
        author: { select: { id: true, userName: true } },
        business: { select: { id: true, businessName: true } },
      },
      orderBy: [
        { priority: 'desc' },
        { publishedAt: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    const data = announcements.map((a) => ({
      id: a.id,
      businessId: a.businessId,
      title: a.title,
      content: a.content,
      priority: a.priority,
      targetScope: a.targetScope,
      publishedAt: a.publishedAt?.toISOString() ?? null,
      expiresAt: a.expiresAt?.toISOString() ?? null,
      createdBy: a.createdBy,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
      author: a.author,
      business: a.business,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// POST /api/v1/announcements
// ============================================

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const body = await request.json();
    const data = createAnnouncementSchema.parse(body);

    const created = await prisma.announcement.create({
      data: {
        title: data.title,
        content: data.content,
        priority: data.priority,
        targetScope: data.targetScope,
        businessId: data.businessId ?? null,
        publishedAt: data.publishedAt ? new Date(data.publishedAt) : null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        createdBy: user.id,
      },
      include: {
        author: { select: { id: true, userName: true } },
        business: { select: { id: true, businessName: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: created.id,
        businessId: created.businessId,
        title: created.title,
        content: created.content,
        priority: created.priority,
        targetScope: created.targetScope,
        publishedAt: created.publishedAt?.toISOString() ?? null,
        expiresAt: created.expiresAt?.toISOString() ?? null,
        createdBy: created.createdBy,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
        author: created.author,
        business: created.business,
      },
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
