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
import { computeAllFormulas } from '@/lib/formula-evaluator';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';

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
  projectCustomData: z.record(z.unknown()).optional(),
  portalVisible: z.boolean().optional(),
  version: z.number().int().min(1),
});

const PROJECT_INCLUDE = {
  customer: {
    select: {
      id: true, version: true, customerCode: true, customerName: true, customerFolderUrl: true,
      customerSalutation: true, customerType: true, customerWebsite: true, customerFiscalMonth: true,
      customerCustomData: true,
      contacts: {
        where: { contactIsRepresentative: true },
        select: { contactName: true },
        take: 1,
      },
      businessLinks: {
        where: { linkStatus: 'active' },
        select: { businessId: true, linkCustomData: true },
      },
    },
  },
  partner: {
    select: {
      id: true, version: true, partnerCode: true, partnerName: true, partnerFolderUrl: true,
      partnerSalutation: true, partnerCustomData: true,
      businessLinks: {
        where: { linkStatus: 'active' },
        select: { businessId: true, linkCustomData: true },
      },
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
    if (user.role === 'partner_admin' || user.role === 'partner_staff') {
      // ポータル非表示の案件は代理店ユーザーにアクセス不可
      if (!project.portalVisible) {
        throw ApiError.forbidden('この案件へのアクセス権がありません');
      }
    }
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

    // formula フィールドの計算値を注入
    const customData = project.projectCustomData as Record<string, unknown> | null;
    const flatCustom: Record<string, unknown> = {};
    if (customData) {
      for (const [k, v] of Object.entries(customData)) {
        flatCustom[`customData_${k}`] = v;
      }
    }
    const business = await prisma.business.findUnique({
      where: { id: project.businessId },
      select: { businessConfig: true },
    });
    const bizConfig = business?.businessConfig as { projectFields?: ProjectFieldDefinition[] } | null;
    const projectFields = bizConfig?.projectFields ?? [];
    if (projectFields.some((f) => f.type === 'formula')) {
      const formulaResults = computeAllFormulas(projectFields, customData);
      for (const [k, v] of Object.entries(formulaResults)) {
        flatCustom[`customData_${k}`] = v;
      }
    }

    // 顧客・代理店カスタムデータを展開
    const customerObj = project.customer as Record<string, unknown> | null;
    const custLinks = (customerObj?.businessLinks ?? []) as Array<{ businessId: number; linkCustomData: unknown }>;
    const custLink = custLinks.find((l) => l.businessId === project.businessId);
    const custLinkData = (custLink?.linkCustomData ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(custLinkData)) flatCustom[`customerLink_${k}`] = v;
    const custGlobalData = (customerObj?.customerCustomData ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(custGlobalData)) flatCustom[`customerGlobal_${k}`] = v;

    const partnerObj = project.partner as Record<string, unknown> | null;
    const partLinks = (partnerObj?.businessLinks ?? []) as Array<{ businessId: number; linkCustomData: unknown }>;
    const partLink = partLinks.find((l) => l.businessId === project.businessId);
    const partLinkData = (partLink?.linkCustomData ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(partLinkData)) flatCustom[`partnerLink_${k}`] = v;
    const partGlobalData = (partnerObj?.partnerCustomData ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(partGlobalData)) flatCustom[`partnerGlobal_${k}`] = v;

    return NextResponse.json({
      success: true,
      data: {
        ...formatProject(project),
        ...flatCustom,
        customerLinkCustomData: custLinkData,
        customerCustomData: custGlobalData,
        partnerLinkCustomData: partLinkData,
        partnerCustomData: partGlobalData,
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

      // formula フィールドの計算結果を永続化（ポータル・ダッシュボード等で正確な値を読めるようにする）
      const bizForFormula = await prisma.business.findUnique({
        where: { id: existing.businessId },
        select: { businessConfig: true },
      });
      const formulaBizConfig = bizForFormula?.businessConfig as { projectFields?: ProjectFieldDefinition[] } | null;
      const formulaFields = formulaBizConfig?.projectFields ?? [];
      if (formulaFields.some((f) => f.type === 'formula')) {
        const formulaResults = computeAllFormulas(formulaFields, mergedCustomData);
        for (const [k, v] of Object.entries(formulaResults)) {
          mergedCustomData[k] = v;
        }
      }
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
    // formula フィールドの計算値を注入
    const bizForPatch = await prisma.business.findUnique({
      where: { id: updated.businessId },
      select: { businessConfig: true },
    });
    const patchBizConfig = bizForPatch?.businessConfig as { projectFields?: ProjectFieldDefinition[] } | null;
    const patchFields = patchBizConfig?.projectFields ?? [];
    if (patchFields.some((f) => f.type === 'formula')) {
      const formulaResults = computeAllFormulas(patchFields, updatedCustomData);
      for (const [k, v] of Object.entries(formulaResults)) {
        flatCustom[`customData_${k}`] = v;
      }
    }

    // 顧客・代理店カスタムデータを展開（PATCHレスポンスでも一覧と同じキーを返す）
    const patchCustomerObj = updated.customer as Record<string, unknown> | null;
    const patchCustLinks = (patchCustomerObj?.businessLinks ?? []) as Array<{ businessId: number; linkCustomData: unknown }>;
    const patchCustLink = patchCustLinks.find((l) => l.businessId === updated.businessId);
    const patchCustLinkData = (patchCustLink?.linkCustomData ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(patchCustLinkData)) flatCustom[`customerLink_${k}`] = v;
    const patchCustGlobalData = (patchCustomerObj?.customerCustomData ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(patchCustGlobalData)) flatCustom[`customerGlobal_${k}`] = v;

    const patchPartnerObj = updated.partner as Record<string, unknown> | null;
    const patchPartLinks = (patchPartnerObj?.businessLinks ?? []) as Array<{ businessId: number; linkCustomData: unknown }>;
    const patchPartLink = patchPartLinks.find((l) => l.businessId === updated.businessId);
    const patchPartLinkData = (patchPartLink?.linkCustomData ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(patchPartLinkData)) flatCustom[`partnerLink_${k}`] = v;
    const patchPartGlobalData = (patchPartnerObj?.partnerCustomData ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(patchPartGlobalData)) flatCustom[`partnerGlobal_${k}`] = v;

    // 顧客/代理店の基本フィールドとversionをフラット展開（GETと同じ構造を返す）
    const patchCustomerFlat: Record<string, unknown> = {};
    const customer = updated.customer as Record<string, unknown> | null;
    if (customer) {
      patchCustomerFlat.customerName = (customer.customerName as string) ?? null;
      patchCustomerFlat.customerSalutation = (customer.customerSalutation as string) ?? null;
      patchCustomerFlat.customerType = (customer.customerType as string) ?? null;
      patchCustomerFlat.customerWebsite = (customer.customerWebsite as string) ?? null;
      patchCustomerFlat.customerFiscalMonth = (customer.customerFiscalMonth as number) ?? null;
      patchCustomerFlat.customerFolderUrl = (customer.customerFolderUrl as string) ?? null;
      patchCustomerFlat.customerVersion = (customer.version as number) ?? null;
    }
    const patchPartnerFlat: Record<string, unknown> = {};
    const partner = updated.partner as Record<string, unknown> | null;
    if (partner) {
      patchPartnerFlat.partnerName = (partner.partnerName as string) ?? null;
      patchPartnerFlat.partnerCode = (partner.partnerCode as string) ?? null;
      patchPartnerFlat.partnerSalutation = (partner.partnerSalutation as string) ?? null;
      patchPartnerFlat.partnerFolderUrl = (partner.partnerFolderUrl as string) ?? null;
      patchPartnerFlat.partnerVersion = (partner.version as number) ?? null;
    }

    return NextResponse.json({
      success: true,
      data: {
        ...formatProject(updated),
        ...flatCustom,
        ...patchCustomerFlat,
        ...patchPartnerFlat,
        customerLinkCustomData: patchCustLinkData,
        customerCustomData: patchCustGlobalData,
        partnerLinkCustomData: patchPartLinkData,
        partnerCustomData: patchPartGlobalData,
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
