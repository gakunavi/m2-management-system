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

const updatePartnerStaffSchema = z.object({
  userName: z.string().min(1, '名前は必須です').max(100).optional(),
  userEmail: z.string().email('有効なメールアドレスを入力してください').max(255).optional(),
  userPassword: z.string().min(8, 'パスワードは8文字以上で入力してください').max(100).optional().nullable(),
  userIsActive: z.boolean().optional(),
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
// GET /api/v1/partner-staff/:id
// ============================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const actor = session.user as { id: number; role: string; partnerId: number };
    if (actor.role !== 'partner_admin') throw ApiError.forbidden();

    const partnerId = actor.partnerId;

    const { id } = await params;
    const userId = parseInt(id, 10);
    if (isNaN(userId)) throw ApiError.notFound('スタッフが見つかりません');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: USER_INCLUDE,
    });

    if (!user || user.userPartnerId !== partnerId || user.userRole !== 'partner_staff') {
      throw ApiError.notFound('スタッフが見つかりません');
    }

    return NextResponse.json({ success: true, data: formatUser(user) });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// PATCH /api/v1/partner-staff/:id
// ============================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const actor = session.user as { id: number; role: string; partnerId: number };
    if (actor.role !== 'partner_admin') throw ApiError.forbidden();

    const partnerId = actor.partnerId;

    const { id } = await params;
    const userId = parseInt(id, 10);
    if (isNaN(userId)) throw ApiError.notFound('スタッフが見つかりません');

    const body = await request.json();
    const data = updatePartnerStaffSchema.parse(body);

    // 対象ユーザー存在チェック＋スコープチェック
    const current = await prisma.user.findUnique({ where: { id: userId } });
    if (!current || current.userPartnerId !== partnerId || current.userRole !== 'partner_staff') {
      throw ApiError.notFound('スタッフが見つかりません');
    }

    // メールアドレス重複チェック（自分以外）
    if (data.userEmail && data.userEmail !== current.userEmail) {
      const dup = await prisma.user.findUnique({ where: { userEmail: data.userEmail } });
      if (dup) throw ApiError.conflict('このメールアドレスはすでに使用されています');
    }

    const updateData: Record<string, unknown> = { updatedBy: actor.id };
    if (data.userName !== undefined) updateData.userName = data.userName;
    if (data.userEmail !== undefined) updateData.userEmail = data.userEmail;
    if (data.userIsActive !== undefined) updateData.userIsActive = data.userIsActive;
    if (data.userPassword) {
      updateData.userPasswordHash = await bcrypt.hash(data.userPassword, 12);
      updateData.userPasswordPlain = data.userPassword;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      include: USER_INCLUDE,
    });

    return NextResponse.json({ success: true, data: formatUser(updated) });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// DELETE /api/v1/partner-staff/:id  (無効化)
// ============================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const actor = session.user as { id: number; role: string; partnerId: number };
    if (actor.role !== 'partner_admin') throw ApiError.forbidden();

    const partnerId = actor.partnerId;

    const { id } = await params;
    const userId = parseInt(id, 10);
    if (isNaN(userId)) throw ApiError.notFound('スタッフが見つかりません');

    // 対象ユーザー存在チェック＋スコープチェック
    const current = await prisma.user.findUnique({ where: { id: userId } });
    if (!current || current.userPartnerId !== partnerId || current.userRole !== 'partner_staff') {
      throw ApiError.notFound('スタッフが見つかりません');
    }

    await prisma.user.update({
      where: { id: userId },
      data: { userIsActive: false, updatedBy: actor.id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
