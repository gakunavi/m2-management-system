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

const USER_SORT_FIELDS = [
  'userName',
  'userEmail',
  'userRole',
  'userIsActive',
  'createdAt',
  'updatedAt',
] as const;

// ============================================
// 入力バリデーションスキーマ
// ============================================

const createUserSchema = z.object({
  userName: z.string().min(1, '名前は必須です').max(100),
  userEmail: z.string().email('有効なメールアドレスを入力してください').max(255),
  userPassword: z.string().min(8, 'パスワードは8文字以上で入力してください').max(100),
  userRole: z.enum(['admin', 'staff', 'partner_admin', 'partner_staff'], {
    errorMap: () => ({ message: '有効なロールを選択してください' }),
  }),
  userPartnerId: z.number().int().positive().optional().nullable(),
  businessIds: z.array(z.number().int().positive()).optional().default([]),
});

// ============================================
// レスポンス整形
// ============================================

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

// ============================================
// GET /api/v1/users
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (user.role !== 'admin') throw ApiError.forbidden();

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '25', 10)));
    const search = searchParams.get('search') ?? '';
    const roleFilter = searchParams.get('userRole') ?? '';
    const isActiveParam = searchParams.get('isActive');
    const sortItems = parseSortParams(searchParams, 'userName');

    const where = {
      ...(search
        ? {
            OR: [
              { userName: { contains: search, mode: 'insensitive' as const } },
              { userEmail: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(roleFilter ? { userRole: roleFilter } : {}),
      ...(isActiveParam === 'true'
        ? { userIsActive: true }
        : isActiveParam === 'false'
          ? { userIsActive: false }
          : {}),
    };

    const orderBy = buildOrderBy(sortItems, USER_SORT_FIELDS, [{ field: 'userName', direction: 'asc' }]);

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
// POST /api/v1/users
// ============================================

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const actor = session.user as { id: number; role: string };
    if (actor.role !== 'admin') throw ApiError.forbidden();

    const body = await request.json();
    const data = createUserSchema.parse(body);

    // メールアドレス重複チェック
    const existing = await prisma.user.findUnique({ where: { userEmail: data.userEmail } });
    if (existing) {
      throw ApiError.conflict('このメールアドレスはすでに使用されています');
    }

    // 代理店ロールの場合は partnerId 必須
    if (['partner_admin', 'partner_staff'].includes(data.userRole) && !data.userPartnerId) {
      throw ApiError.badRequest('代理店ロールには代理店の指定が必要です');
    }

    const passwordHash = await bcrypt.hash(data.userPassword, 12);

    const newUser = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          userEmail: data.userEmail,
          userName: data.userName,
          userPasswordHash: passwordHash,
          userPasswordPlain: data.userPassword,
          userRole: data.userRole,
          userPartnerId: data.userPartnerId ?? null,
          userIsActive: true,
          createdBy: actor.id,
          updatedBy: actor.id,
        },
        include: USER_INCLUDE,
      });

      // 事業アサイン
      if (data.businessIds.length > 0) {
        await tx.userBusinessAssignment.createMany({
          data: data.businessIds.map((businessId) => ({
            userId: created.id,
            businessId,
            assignmentRole: 'member',
          })),
          skipDuplicates: true,
        });
      }

      return tx.user.findUniqueOrThrow({
        where: { id: created.id },
        include: USER_INCLUDE,
      });
    });

    return NextResponse.json({ success: true, data: formatUser(newUser) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
