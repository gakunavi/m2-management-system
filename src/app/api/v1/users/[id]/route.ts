import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import bcrypt from 'bcryptjs';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

// ============================================
// 入力バリデーションスキーマ
// ============================================

const updateUserSchema = z.object({
  userName: z.string().min(1, '名前は必須です').max(100).optional(),
  userEmail: z.string().email('有効なメールアドレスを入力してください').max(255).optional(),
  userPassword: z.string().min(8, 'パスワードは8文字以上で入力してください').max(100).optional().nullable(),
  userRole: z.enum(['admin', 'staff', 'partner_admin', 'partner_staff']).optional(),
  userPartnerId: z.number().int().positive().optional().nullable(),
  userIsActive: z.boolean().optional(),
  businessIds: z.array(z.number().int().positive()).optional(),
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
// GET /api/v1/users/:id
// ============================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const actor = session.user as { id: number; role: string };
    if (actor.role !== 'admin') throw ApiError.forbidden();

    const { id } = await params;
    const userId = parseInt(id, 10);
    if (isNaN(userId)) throw ApiError.notFound('ユーザーが見つかりません');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: USER_INCLUDE,
    });
    if (!user) throw ApiError.notFound('ユーザーが見つかりません');

    return NextResponse.json({ success: true, data: formatUser(user) });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// PATCH /api/v1/users/:id
// ============================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const actor = session.user as { id: number; role: string };
    if (actor.role !== 'admin') throw ApiError.forbidden();

    const { id } = await params;
    const userId = parseInt(id, 10);
    if (isNaN(userId)) throw ApiError.notFound('ユーザーが見つかりません');

    const body = await request.json();
    const data = updateUserSchema.parse(body);

    // 対象ユーザー存在チェック
    const current = await prisma.user.findUnique({ where: { id: userId } });
    if (!current) throw ApiError.notFound('ユーザーが見つかりません');

    // 自分自身のロール・有効化ステータス変更禁止（自分をadminから外したりdisabledにすると詰む）
    if (userId === actor.id) {
      if (data.userRole && data.userRole !== current.userRole) {
        throw ApiError.badRequest('自分自身のロールは変更できません');
      }
      if (data.userIsActive === false) {
        throw ApiError.badRequest('自分自身を無効化することはできません');
      }
    }

    // メールアドレス重複チェック（自分以外）
    if (data.userEmail && data.userEmail !== current.userEmail) {
      const dup = await prisma.user.findUnique({ where: { userEmail: data.userEmail } });
      if (dup) throw ApiError.conflict('このメールアドレスはすでに使用されています');
    }

    // 代理店ロールの場合は partnerId 必須
    const newRole = data.userRole ?? current.userRole;
    const newPartnerId = 'userPartnerId' in data ? data.userPartnerId : current.userPartnerId;
    if (['partner_admin', 'partner_staff'].includes(newRole) && !newPartnerId) {
      throw ApiError.badRequest('代理店ロールには代理店の指定が必要です');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = { updatedBy: actor.id };
      if (data.userName !== undefined) updateData.userName = data.userName;
      if (data.userEmail !== undefined) updateData.userEmail = data.userEmail;
      if (data.userRole !== undefined) updateData.userRole = data.userRole;
      if ('userPartnerId' in data) updateData.userPartnerId = data.userPartnerId ?? null;
      if (data.userIsActive !== undefined) updateData.userIsActive = data.userIsActive;
      if (data.userPassword) {
        updateData.userPasswordHash = await bcrypt.hash(data.userPassword, 12);
        updateData.userPasswordPlain = data.userPassword;
      }

      await tx.user.update({ where: { id: userId }, data: updateData });

      // 事業アサイン更新（差分）
      if (data.businessIds !== undefined) {
        await tx.userBusinessAssignment.deleteMany({ where: { userId } });
        if (data.businessIds.length > 0) {
          await tx.userBusinessAssignment.createMany({
            data: data.businessIds.map((businessId) => ({
              userId,
              businessId,
              assignmentRole: 'member',
            })),
            skipDuplicates: true,
          });
        }
      }

      return tx.user.findUniqueOrThrow({
        where: { id: userId },
        include: USER_INCLUDE,
      });
    });

    return NextResponse.json({ success: true, data: formatUser(updated) });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// DELETE /api/v1/users/:id  (無効化)
// ============================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const actor = session.user as { id: number; role: string };
    if (actor.role !== 'admin') throw ApiError.forbidden();

    const { id } = await params;
    const userId = parseInt(id, 10);
    if (isNaN(userId)) throw ApiError.notFound('ユーザーが見つかりません');

    if (userId === actor.id) {
      throw ApiError.badRequest('自分自身を削除することはできません');
    }

    const current = await prisma.user.findUnique({ where: { id: userId } });
    if (!current || !current.userIsActive) throw ApiError.notFound('ユーザーが見つかりません');

    await prisma.user.update({
      where: { id: userId },
      data: { userIsActive: false, updatedBy: actor.id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
