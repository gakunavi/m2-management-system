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

    // visibleToPartner=true のテンプレートのみ取得
    const templates = await prisma.movementTemplate.findMany({
      where: { businessId: bizId, stepIsActive: true, visibleToPartner: true },
      orderBy: { stepNumber: 'asc' },
      select: { id: true, stepNumber: true, stepCode: true, stepName: true },
    });

    const visibleTemplateIds = templates.map((t) => t.id);

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

    // ステータス定義
    const allStatusDefs = await prisma.businessStatusDefinition.findMany({
      where: { businessId: bizId, statusIsActive: true },
      select: { statusCode: true, statusLabel: true, statusColor: true, statusSortOrder: true },
      orderBy: { statusSortOrder: 'asc' },
    });
    const statusMap = new Map(
      allStatusDefs.map((s) => [s.statusCode, { label: s.statusLabel, color: s.statusColor }]),
    );

    // レスポンス整形
    const data = projects.map((p) => {
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
        customerName: p.customer?.customerName ?? null,
        movements: p.movements.map((m) => ({
          id: m.id,
          movementStatus: m.movementStatus,
          movementStartedAt: m.movementStartedAt?.toISOString() ?? null,
          movementCompletedAt: m.movementCompletedAt?.toISOString() ?? null,
          movementNotes: m.movementNotes,
          templateId: m.template.id,
          stepNumber: m.template.stepNumber,
          stepCode: m.template.stepCode,
          stepName: m.template.stepName,
        })),
      };
    });

    return NextResponse.json({
      success: true,
      data,
      meta: {
        total: data.length,
        templates,
        statusDefinitions: allStatusDefs.map((s) => ({
          statusCode: s.statusCode,
          statusLabel: s.statusLabel,
          statusColor: s.statusColor,
        })),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
