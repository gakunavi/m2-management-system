import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { parseSortParams, buildOrderBy, BUSINESS_SORT_FIELDS } from '@/lib/sort-helper';
import { formatBusiness } from '@/lib/format-business';
import { whereBoolean, whereDateRange } from '@/lib/filter-helper';
import { getBusinessIdsForUser } from '@/lib/revenue-helpers';

// ============================================
// 入力バリデーションスキーマ
// ============================================

const createBusinessSchema = z.object({
  businessCode: z.string().min(1, '事業コードは必須です').max(20),
  businessName: z.string().min(1, '事業名は必須です').max(100),
  businessDescription: z.string().optional().nullable(),
  businessSortOrder: z.number().int().min(0).optional().default(0),
});

// ============================================
// GET /api/v1/businesses
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string; partnerId?: number | null };

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '25', 10)));
    const search = searchParams.get('search') ?? '';
    const sortItems = parseSortParams(searchParams, 'businessSortOrder');

    // ロール別スコープ: admin=全件, staff=アサイン事業, partner=リンク事業
    const businessIds = await getBusinessIdsForUser(prisma, user);

    const where = {
      ...(businessIds ? { id: { in: businessIds } } : {}),
      ...(search
        ? {
            OR: [
              { businessName: { contains: search, mode: 'insensitive' as const } },
              { businessCode: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...whereDateRange(searchParams, 'createdAt'),
      ...(whereBoolean(searchParams, 'isActive', 'businessIsActive') ?? {}),
    };

    const orderBy = buildOrderBy(sortItems, BUSINESS_SORT_FIELDS, [{ field: 'businessSortOrder', direction: 'asc' }]);

    const [total, businesses] = await Promise.all([
      prisma.business.count({ where }),
      prisma.business.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: businesses.map(formatBusiness),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// POST /api/v1/businesses
// ============================================

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const body = await request.json();
    const data = createBusinessSchema.parse(body);

    const business = await prisma.business.create({
      data: {
        businessCode: data.businessCode,
        businessName: data.businessName,
        businessDescription: data.businessDescription ?? null,
        businessSortOrder: data.businessSortOrder,
        createdBy: user.id,
        updatedBy: user.id,
      },
    });

    return NextResponse.json({ success: true, data: formatBusiness(business) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
