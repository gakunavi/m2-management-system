import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { formatProject } from '@/lib/format-project';
import { createNotificationsForUsers } from '@/lib/notification-helper';
import { getBusinessPartnerScope } from '@/lib/revenue-helpers';

const updateProjectSchema = z.object({
  partnerId: z.number().int().positive().optional().nullable(),
  projectSalesStatus: z.string().min(1).optional(),
  projectExpectedCloseMonth: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional()
    .nullable()
    .or(z.literal('')),
  projectAssignedUserId: z.number().int().positive().optional().nullable(),
  projectAssignedUserName: z.string().max(100).optional().nullable().or(z.literal('')),
  projectNotes: z.string().max(2000).optional().nullable().or(z.literal('')),
  projectRenovationNumber: z.string().max(100).optional().nullable().or(z.literal('')),
  projectCustomData: z.record(z.unknown()).optional(),
  version: z.number().int().min(1),
});

const PROJECT_INCLUDE = {
  customer: {
    select: {
      id: true, customerCode: true, customerName: true, customerFolderUrl: true,
      customerSalutation: true, customerType: true, customerWebsite: true, customerFiscalMonth: true,
      contacts: {
        where: { contactIsRepresentative: true },
        select: { contactName: true },
        take: 1,
      },
    },
  },
  partner: {
    select: {
      id: true, partnerCode: true, partnerName: true, partnerFolderUrl: true,
      partnerSalutation: true,
    },
  },
  business: { select: { id: true, businessName: true } },
  assignedUser: { select: { id: true, userName: true } },
} as const;

// ============================================
// GET /api/v1/projects/:id
// ============================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const { id } = await params;
    const projectId = parseInt(id, 10);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: PROJECT_INCLUDE,
    });

    if (!project) throw ApiError.notFound('案件が見つかりません');

    // 代理店ユーザーのアクセス制御
    const user = session.user as { id: number; role: string; partnerId: number | null };
    if (user.role === 'partner_admin' && user.partnerId) {
      const partnerIds = await getBusinessPartnerScope(prisma, user.partnerId, project.businessId);
      if (!partnerIds.includes(project.partnerId ?? -1)) {
        throw ApiError.forbidden('この案件へのアクセス権がありません');
      }
    } else if (user.role === 'partner_staff') {
      if (project.projectAssignedUserId !== user.id) {
        throw ApiError.forbidden('この案件へのアクセス権がありません');
      }
    }

    // ステータス定義を付加
    const statusDef = await prisma.businessStatusDefinition.findFirst({
      where: { businessId: project.businessId, statusCode: project.projectSalesStatus },
      select: { statusLabel: true, statusColor: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...formatProject(project),
        projectSalesStatusLabel: statusDef?.statusLabel ?? null,
        projectSalesStatusColor: statusDef?.statusColor ?? null,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// PATCH /api/v1/projects/:id
// ============================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    const { id } = await params;
    const projectId = parseInt(id, 10);

    const body = await request.json();
    const data = updateProjectSchema.parse(body);
    const { version, projectCustomData: newCustomData, projectSalesStatus, ...updateData } = data;

    const existing = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, version: true, projectSalesStatus: true, projectCustomData: true, businessId: true },
    });
    if (!existing) throw ApiError.notFound('案件が見つかりません');
    if (existing.version !== version) {
      throw new ApiError('CONFLICT', '他のユーザーが変更しました。最新データを取得してください。', 409);
    }

    // 営業ステータスの確認（変更時のみ）
    let statusChangedAt: Date | undefined;
    if (projectSalesStatus && projectSalesStatus !== existing.projectSalesStatus) {
      const statusDef = await prisma.businessStatusDefinition.findFirst({
        where: { businessId: existing.businessId, statusCode: projectSalesStatus, statusIsActive: true },
      });
      if (!statusDef) throw ApiError.badRequest('指定された営業ステータスが見つかりません');
      statusChangedAt = new Date();
    }

    // projectCustomData のディープマージ
    let mergedCustomData: Record<string, unknown> | undefined;
    if (newCustomData !== undefined) {
      const existingCustomData = (existing.projectCustomData ?? {}) as Record<string, unknown>;
      mergedCustomData = { ...existingCustomData, ...newCustomData };
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: {
        ...updateData,
        ...(projectSalesStatus !== undefined && { projectSalesStatus }),
        ...(statusChangedAt && { projectStatusChangedAt: statusChangedAt }),
        ...(mergedCustomData !== undefined && { projectCustomData: mergedCustomData as Prisma.InputJsonValue }),
        version: { increment: 1 },
        updatedBy: user.id,
      },
      include: PROJECT_INCLUDE,
    });

    // ステータスラベル・色を付加
    const statusDef = await prisma.businessStatusDefinition.findFirst({
      where: { businessId: updated.businessId, statusCode: updated.projectSalesStatus },
      select: { statusLabel: true, statusColor: true },
    });

    // ステータス変更時の通知生成（非ブロッキング）
    if (statusChangedAt) {
      const newLabel = statusDef?.statusLabel ?? projectSalesStatus;
      void (async () => {
        try {
          const notifyUserIds: number[] = [];

          // 1. 社内主担当者（操作者自身は除外）
          if (updated.projectAssignedUserId && updated.projectAssignedUserId !== user.id) {
            notifyUserIds.push(updated.projectAssignedUserId);
          }

          // 2. 案件に紐づく代理店の partner_admin ユーザー
          if (updated.partnerId) {
            const partnerAdmins = await prisma.user.findMany({
              where: {
                userPartnerId: updated.partnerId,
                userRole: 'partner_admin',
                userIsActive: true,
              },
              select: { id: true },
            });
            for (const pa of partnerAdmins) {
              if (pa.id !== user.id && !notifyUserIds.includes(pa.id)) {
                notifyUserIds.push(pa.id);
              }
            }
          }

          if (notifyUserIds.length > 0) {
            await createNotificationsForUsers(notifyUserIds, {
              type: 'status_change',
              title: '案件ステータス変更',
              message: `案件「${updated.projectNo}」のステータスが「${newLabel}」に変更されました`,
              relatedEntity: 'project',
              relatedEntityId: updated.id,
            });
          }
        } catch {
          // 通知失敗はメイン処理に影響させない
        }
      })();
    }

    // customData をフラットキーに展開（一覧キャッシュ直接更新で EditableCell の URL 型検出用）
    const updatedCustomData = updated.projectCustomData as Record<string, unknown> | null;
    const flatCustom: Record<string, unknown> = {};
    if (updatedCustomData) {
      for (const [k, v] of Object.entries(updatedCustomData)) {
        flatCustom[`customData_${k}`] = v;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...formatProject(updated),
        ...flatCustom,
        projectSalesStatusLabel: statusDef?.statusLabel ?? null,
        projectSalesStatusColor: statusDef?.statusColor ?? null,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// DELETE /api/v1/projects/:id
// ============================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id } = await params;
    const projectId = parseInt(id, 10);

    const existing = await prisma.project.findUnique({ where: { id: projectId } });
    if (!existing) throw ApiError.notFound('案件が見つかりません');

    await prisma.project.update({
      where: { id: projectId },
      data: { projectIsActive: false, updatedBy: user.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
