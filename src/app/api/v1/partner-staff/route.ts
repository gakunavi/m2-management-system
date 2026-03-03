import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import bcrypt from 'bcryptjs';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { parseSortParams, buildOrderBy } from '@/lib/sort-helper';

// ============================================
// ソート許可フィールド
// ============================================

const PARTNER_STAFF_SORT_FIELDS = [
  'userName',
  'userEmail',
  'userIsActive',
  'createdAt',
] as const;

// ============================================
// 入力バリデーションスキーマ
// ============================================

const createPartnerStaffSchema = z.object({
  userName: z.string().min(1, '名前は必須です').max(100),
  userEmail: z.string().email('有効なメールアドレスを入力してください').max(255),
  userPassword: z.string().min(8, 'パスワードは8文字以上で入力してください').max(100),
});

// ============================================
// レスポンス整形
// ============================================

const USER_ROLE_LABELS: Record<string, string> = {
  admin: '管理者',
  staff: 'スタッフ',
  partner_admin: '代理店管理者',
  partner_staff: '代理店スタッフ',
};

const USER_INCLUDE = {
  partner: { select: { id: true, partnerName: true } },
  businessAssignments: {
    include: {
      business: { select: { id: true, businessCode: true, businessName: true } },
    },
  },
} as const;

function formatUser(user: {
  id: number;
  userEmail: string;
  userName: string;
  userRole: string;
  userPartnerId: number | null;
  userPasswordPlain: string | null;
  userIsActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  partner?: { id: number; partnerName: string } | null;
  businessAssignments?: { business: { id: number; businessCode: string; businessName: string } }[];
}) {
  return {
    id: user.id,
    userEmail: user.userEmail,
    userName: user.userName,
    userRole: user.userRole,
    userRoleLabel: USER_ROLE_LABELS[user.userRole] ?? user.userRole,
    userPartnerId: user.userPartnerId,
    userPasswordPlain: user.userPasswordPlain,
    userIsActive: user.userIsActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    partner: user.partner
      ? { id: user.partner.id, partnerName: user.partner.partnerName }
      : null,
    businesses: (user.businessAssignments ?? []).map((a) => ({
      id: a.business.id,
      businessCode: a.business.businessCode,
      businessName: a.business.businessName,
    })),
  };
}

// ============================================
// GET /api/v1/partner-staff
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const actor = session.user as { id: number; role: string; partnerId: number };
    if (actor.role !== 'partner_admin') throw ApiError.forbidden();

    const partnerId = actor.partnerId;

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '25', 10)));
    const search = searchParams.get('search') ?? '';
    const isActiveParam = searchParams.get('isActive');
    const sortItems = parseSortParams(searchParams, 'userName');

    const where = {
      userPartnerId: partnerId,
      userRole: 'partner_staff' as const,
      ...(search
        ? {
            OR: [
              { userName: { contains: search, mode: 'insensitive' as const } },
              { userEmail: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(isActiveParam === 'true'
        ? { userIsActive: true }
        : isActiveParam === 'false'
          ? { userIsActive: false }
          : {}),
    };

    const orderBy = buildOrderBy(sortItems, PARTNER_STAFF_SORT_FIELDS, [{ field: 'userName', direction: 'asc' }]);

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        include: USER_INCLUDE,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: users.map(formatUser),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// POST /api/v1/partner-staff
// ============================================

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const actor = session.user as { id: number; role: string; partnerId: number };
    if (actor.role !== 'partner_admin') throw ApiError.forbidden();

    const partnerId = actor.partnerId;

    const body = await request.json();
    const data = createPartnerStaffSchema.parse(body);

    // メールアドレス重複チェック
    const existing = await prisma.user.findUnique({ where: { userEmail: data.userEmail } });
    if (existing) {
      throw ApiError.conflict('このメールアドレスはすでに使用されています');
    }

    const passwordHash = await bcrypt.hash(data.userPassword, 12);

    const newUser = await prisma.user.create({
      data: {
        userEmail: data.userEmail,
        userName: data.userName,
        userPasswordHash: passwordHash,
        userPasswordPlain: data.userPassword,
        userRole: 'partner_staff',
        userPartnerId: partnerId,
        userIsActive: true,
        createdBy: actor.id,
        updatedBy: actor.id,
      },
      include: USER_INCLUDE,
    });

    return NextResponse.json({ success: true, data: formatUser(newUser) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
