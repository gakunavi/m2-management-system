import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// ============================================
// GET /api/v1/projects/movements
// 事業内の全案件ムーブメント一覧（マトリクス表用）
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string; partnerId?: number };
    const { searchParams } = request.nextUrl;

    const businessId = searchParams.get('businessId');
    if (!businessId) throw ApiError.badRequest('businessId は必須です');

    const bizId = parseInt(businessId, 10);

    // ロールベースのスコープ
    const where: Record<string, unknown> = {
      businessId: bizId,
      projectIsActive: true,
    };

    if (user.role === 'staff') {
      // staff は自分がアサインされた事業のみ
      const assignments = await prisma.userBusinessAssignment.findMany({
        where: { userId: user.id, businessId: bizId },
        select: { businessId: true },
      });
      if (assignments.length === 0) throw ApiError.forbidden();
    } else if (user.role === 'partner_admin' || user.role === 'partner_staff') {
      if (user.partnerId) {
        where.partnerId = user.partnerId;
      }
    }

    // ステータスフィルター
    const statusFilter = searchParams.get('statuses');
    if (statusFilter) {
      const statuses = statusFilter.split(',').filter(Boolean);
      if (statuses.length > 0) {
        where.projectSalesStatus = { in: statuses };
      }
    }

    // 取得件数制限（デフォルト200、最大500）
    const limitParam = searchParams.get('limit');
    const take = limitParam
      ? Math.min(500, Math.max(1, parseInt(limitParam, 10)))
      : 200;

    // 全案件 + ムーブメント + テンプレート取得
    const projects = await prisma.project.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take,
      select: {
        id: true,
        projectNo: true,
        projectSalesStatus: true,
        projectExpectedCloseMonth: true,
        projectAssignedUserName: true,
        projectNotes: true,
        projectCustomData: true,
        version: true,
        customer: { select: { id: true, customerName: true } },
        partner: { select: { id: true, partnerName: true } },
        movements: {
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

    // 事業の全ステータス定義を取得（フィルターUI + ラベル解決用）
    const allStatusDefs = await prisma.businessStatusDefinition.findMany({
      where: { businessId: bizId, statusIsActive: true },
      select: { statusCode: true, statusLabel: true, statusColor: true, statusSortOrder: true, statusIsFinal: true, statusIsLost: true },
      orderBy: { statusSortOrder: 'asc' },
    });
    const statusMap = new Map(
      allStatusDefs.map((s) => [s.statusCode, { label: s.statusLabel, color: s.statusColor }]),
    );

    // 事業設定（カスタムフィールド定義）
    const business = await prisma.business.findUnique({
      where: { id: bizId },
      select: { businessConfig: true },
    });
    const businessConfig = (business?.businessConfig ?? {}) as Record<string, unknown>;
    const projectFields = (businessConfig.projectFields ?? []) as Array<{ key: string; label: string }>;
    // 「ニーズ」フィールドのキーを特定
    const needsField = projectFields.find((f) => f.label === 'ニーズ');
    const needsKey = needsField?.key ?? null;

    // ムーブメントテンプレート一覧（列ヘッダー用）
    const templates = await prisma.movementTemplate.findMany({
      where: { businessId: bizId, stepIsActive: true },
      orderBy: { stepNumber: 'asc' },
      select: { id: true, stepNumber: true, stepCode: true, stepName: true },
    });

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
        projectNeeds: needsKey ? String((p.projectCustomData as Record<string, unknown>)?.[needsKey] ?? '') || null : null,
        version: p.version,
        customerName: p.customer?.customerName ?? null,
        partnerName: p.partner?.partnerName ?? null,
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
          statusIsFinal: s.statusIsFinal,
          statusIsLost: s.statusIsLost,
        })),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
