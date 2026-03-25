import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { getBusinessPartnerScope } from '@/lib/revenue-helpers';

export const dynamic = 'force-dynamic';

// ============================================
// GET /api/v1/portal/movements
// 代理店ポータル向けムーブメント一覧（visibleToPartner=true のみ）
// ============================================

type SessionUser = { id: number; role: string; partnerId: number | null };

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as SessionUser;
    if (!['partner_admin', 'partner_staff'].includes(user.role)) {
      throw ApiError.forbidden();
    }

    const { searchParams } = request.nextUrl;
    const businessId = searchParams.get('businessId');
    if (!businessId) throw ApiError.badRequest('businessId は必須です');

    const bizId = parseInt(businessId, 10);
    if (isNaN(bizId)) throw ApiError.badRequest('businessId が不正です');

    // ロールベースのスコープ
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {
      businessId: bizId,
      projectIsActive: true,
      portalVisible: true,
    };

    if (user.role === 'partner_admin') {
      if (!user.partnerId) throw ApiError.forbidden();
      const partnerIds = await getBusinessPartnerScope(prisma, user.partnerId, bizId);
      where.partnerId = { in: partnerIds };
    } else if (user.role === 'partner_staff') {
      where.projectAssignedUserId = user.id;
    }

    // ステータスフィルター
    const statusFilter = searchParams.get('statuses');
    if (statusFilter) {
      const statuses = statusFilter.split(',').filter(Boolean);
      if (statuses.length > 0) {
        where.projectSalesStatus = { in: statuses };
      }
    }

    // 受注予定月フィルター
    const monthFrom = searchParams.get('expectedCloseMonthFrom');
    const monthTo = searchParams.get('expectedCloseMonthTo');
    if (monthFrom || monthTo) {
      where.projectExpectedCloseMonth = {};
      if (monthFrom) {
        (where.projectExpectedCloseMonth as Record<string, string>).gte = monthFrom;
      }
      if (monthTo) {
        (where.projectExpectedCloseMonth as Record<string, string>).lte = monthTo;
      }
    }

    // テキスト検索（顧客名・案件番号）
    const searchText = searchParams.get('search');
    if (searchText) {
      where.OR = [
        { customer: { customerName: { contains: searchText, mode: 'insensitive' } } },
        { projectNo: { contains: searchText, mode: 'insensitive' } },
      ];
    }

    // カスタムフィールドフィルター（アプリケーション側で処理）
    const customFieldFilters: { key: string; value: string }[] = [];
    searchParams.forEach((paramValue, paramKey) => {
      const match = paramKey.match(/^customField_(.+)$/);
      if (match && paramValue) {
        customFieldFilters.push({ key: match[1], value: paramValue });
      }
    });

    // visibleToPartner=true のテンプレートのみ取得
    const templates = await prisma.movementTemplate.findMany({
      where: { businessId: bizId, stepIsActive: true, visibleToPartner: true },
      orderBy: { stepNumber: 'asc' },
      select: { id: true, stepNumber: true, stepCode: true, stepName: true, stepLinkedFieldKey: true },
    });

    const visibleTemplateIds = templates.map((t) => t.id);
    // テンプレートID → 連動フィールドキーのマップ
    const templateLinkedFieldMap = new Map(
      templates
        .filter((t) => t.stepLinkedFieldKey)
        .map((t) => [t.id, t.stepLinkedFieldKey!]),
    );

    // 案件 + ムーブメント取得（visibleToPartner テンプレートのみ）
    const projects = await prisma.project.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        projectNo: true,
        projectSalesStatus: true,
        projectExpectedCloseMonth: true,
        projectAssignedUserName: true,
        projectNotes: true,
        projectCustomData: true,
        customer: { select: { customerName: true } },
        movements: {
          where: { templateId: { in: visibleTemplateIds } },
          select: {
            id: true,
            movementStatus: true,
            movementStartedAt: true,
            movementCompletedAt: true,
            movementNotes: true,
            template: {
              select: {
                id: true,
                stepNumber: true,
                stepCode: true,
                stepName: true,
              },
            },
          },
          orderBy: { template: { stepNumber: 'asc' } },
        },
      },
    });

    // 事業設定（カスタムフィールド定義）
    const business = await prisma.business.findUnique({
      where: { id: bizId },
      select: { businessConfig: true },
    });
    const businessConfig = (business?.businessConfig ?? {}) as Record<string, unknown>;
    const projectFields = (businessConfig.projectFields ?? []) as Array<{ key: string; label: string; type: string; options?: string[]; filterable?: boolean; visibleToPartner?: boolean; sortOrder: number }>;
    const needsField = projectFields.find((f) => f.label === 'ニーズ');
    const needsKey = needsField?.key ?? null;
    // filterable かつ visibleToPartner なフィールド定義
    const filterableFieldDefs = projectFields
      .filter((f) => f.filterable && f.visibleToPartner)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options }));

    // ステータス定義
    const allStatusDefs = await prisma.businessStatusDefinition.findMany({
      where: { businessId: bizId, statusIsActive: true },
      select: { statusCode: true, statusLabel: true, statusColor: true, statusSortOrder: true, statusIsFinal: true, statusIsLost: true },
      orderBy: { statusSortOrder: 'asc' },
    });
    const statusMap = new Map(
      allStatusDefs.map((s) => [s.statusCode, { label: s.statusLabel, color: s.statusColor }]),
    );

    // カスタムフィールドフィルタリング（JSONB アプリケーション側）
    const filteredProjects = customFieldFilters.length > 0
      ? projects.filter((p) => {
          const customData = (p.projectCustomData ?? {}) as Record<string, unknown>;
          return customFieldFilters.every(({ key, value }) => {
            const fieldValue = customData[key];
            if (fieldValue === undefined || fieldValue === null) return !value;
            if (value === 'true') return fieldValue === true || fieldValue === 'true';
            if (value === 'false') return fieldValue === false || fieldValue === 'false' || !fieldValue;
            return String(fieldValue).toLowerCase().includes(value.toLowerCase());
          });
        })
      : projects;

    // レスポンス整形
    const data = filteredProjects.map((p) => {
      const status = statusMap.get(p.projectSalesStatus);
      return {
        id: p.id,
        projectNo: p.projectNo,
        projectSalesStatus: p.projectSalesStatus,
        projectSalesStatusLabel: status?.label ?? null,
        projectSalesStatusColor: status?.color ?? null,
        projectExpectedCloseMonth: p.projectExpectedCloseMonth,
        projectAssignedUserName: p.projectAssignedUserName,
        projectNotes: p.projectNotes,
        projectNeeds: needsKey ? String((p.projectCustomData as Record<string, unknown>)?.[needsKey] ?? '') || null : null,
        customerName: p.customer?.customerName ?? null,
        movements: p.movements.map((m) => {
          const linkedKey = templateLinkedFieldMap.get(m.template.id);
          const customData = (p.projectCustomData ?? {}) as Record<string, unknown>;
          return {
            id: m.id,
            movementStatus: m.movementStatus,
            movementStartedAt: m.movementStartedAt?.toISOString() ?? null,
            movementCompletedAt: m.movementCompletedAt?.toISOString() ?? null,
            movementNotes: m.movementNotes,
            templateId: m.template.id,
            stepNumber: m.template.stepNumber,
            stepCode: m.template.stepCode,
            stepName: m.template.stepName,
            linkedFieldValue: linkedKey ? (customData[linkedKey] ?? null) : undefined,
          };
        }),
      };
    });

    return NextResponse.json({
      success: true,
      data,
      meta: {
        total: data.length,
        templates: templates.map((t) => {
          const fieldDef = t.stepLinkedFieldKey
            ? projectFields.find((f) => f.key === t.stepLinkedFieldKey && f.visibleToPartner)
            : null;
          return {
            id: t.id,
            stepNumber: t.stepNumber,
            stepCode: t.stepCode,
            stepName: t.stepName,
            stepLinkedFieldKey: fieldDef ? t.stepLinkedFieldKey : null,
            linkedFieldLabel: fieldDef?.label ?? null,
            linkedFieldType: fieldDef?.type ?? null,
            linkedFieldOptions: fieldDef?.options ?? null,
          };
        }),
        statusDefinitions: allStatusDefs.map((s) => ({
          statusCode: s.statusCode,
          statusLabel: s.statusLabel,
          statusColor: s.statusColor,
          statusSortOrder: s.statusSortOrder,
          statusIsFinal: s.statusIsFinal,
          statusIsLost: s.statusIsLost,
        })),
        filterableFields: filterableFieldDefs,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
