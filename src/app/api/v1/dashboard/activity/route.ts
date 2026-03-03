import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { getBusinessIdsForUser } from '@/lib/revenue-helpers';

// ============================================
// GET /api/v1/dashboard/activity?businessId=1&limit=20
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string; partnerId?: number | null };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { searchParams } = request.nextUrl;
    const businessIdParam = searchParams.get('businessId');
    const businessId = businessIdParam ? parseInt(businessIdParam, 10) : null;
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));

    // スコープ制御
    const allowedIds = await getBusinessIdsForUser(prisma, user);
    if (businessId !== null && allowedIds !== null && !allowedIds.includes(businessId)) {
      throw ApiError.forbidden();
    }

    const projectWhere: Record<string, unknown> = { projectIsActive: true };
    if (businessId !== null) {
      projectWhere.businessId = businessId;
    } else if (allowedIds !== null) {
      projectWhere.businessId = { in: allowedIds };
    }

    const projects = await prisma.project.findMany({
      where: projectWhere,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        projectNo: true,
        projectSalesStatus: true,
        businessId: true,
        createdAt: true,
        updatedAt: true,
        customer: { select: { customerName: true } },
        updater: { select: { userName: true } },
        creator: { select: { userName: true } },
      },
    });

    // ステータス定義を一括取得（N+1 回避）
    const businessIds = Array.from(new Set(projects.map((p) => p.businessId)));
    const statusDefs = businessIds.length > 0
      ? await prisma.businessStatusDefinition.findMany({
          where: { businessId: { in: businessIds }, statusIsActive: true },
          select: { businessId: true, statusCode: true, statusLabel: true },
        })
      : [];

    const statusLabelMap = new Map<string, string>();
    for (const sd of statusDefs) {
      statusLabelMap.set(`${sd.businessId}:${sd.statusCode}`, sd.statusLabel);
    }

    const activities = projects.map((p) => {
      // createdAt と updatedAt の差が1秒以内なら新規作成
      const isNew = Math.abs(p.createdAt.getTime() - p.updatedAt.getTime()) < 1000;
      const statusLabel = statusLabelMap.get(`${p.businessId}:${p.projectSalesStatus}`) ?? p.projectSalesStatus;

      let type: 'created' | 'status_change' | 'updated';
      let description: string;

      if (isNew) {
        type = 'created';
        description = '新規作成';
      } else {
        // 変更履歴テーブルがないため、ステータスが含まれた更新を簡易検出
        type = 'updated';
        description = `更新（ステータス: ${statusLabel}）`;
      }

      return {
        id: p.id,
        type,
        projectId: p.id,
        projectNo: p.projectNo,
        customerName: p.customer.customerName,
        description,
        timestamp: p.updatedAt.toISOString(),
        userName: (isNew ? p.creator?.userName : p.updater?.userName) ?? '不明',
      };
    });

    return NextResponse.json({
      success: true,
      data: { activities },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
