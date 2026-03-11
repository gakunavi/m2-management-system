import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// ============================================
// POST /api/v1/businesses/:id/movement-templates/sync
// 全案件の ProjectMovement をテンプレートと一括同期
// ============================================
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id } = await params;
    const businessId = parseInt(id, 10);
    if (isNaN(businessId)) throw ApiError.notFound('事業が見つかりません');

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, businessIsActive: true },
    });
    if (!business || !business.businessIsActive) throw ApiError.notFound('事業が見つかりません');

    const result = await prisma.$transaction(async (tx) => {
      // アクティブなテンプレートを取得
      const activeTemplates = await tx.movementTemplate.findMany({
        where: { businessId, stepIsActive: true },
        select: { id: true },
      });

      // 非アクティブなテンプレートを取得
      const inactiveTemplates = await tx.movementTemplate.findMany({
        where: { businessId, stepIsActive: false },
        select: { id: true },
      });

      // 事業内の全案件を取得
      const projects = await tx.project.findMany({
        where: { businessId },
        select: { id: true },
      });

      let created = 0;
      let deleted = 0;

      // アクティブテンプレート × 全案件 で ProjectMovement を一括追加
      if (activeTemplates.length > 0 && projects.length > 0) {
        const data = activeTemplates.flatMap((t) =>
          projects.map((p) => ({
            projectId: p.id,
            templateId: t.id,
            movementStatus: 'pending',
          }))
        );

        const createResult = await tx.projectMovement.createMany({
          data,
          skipDuplicates: true,
        });
        created = createResult.count;
      }

      // 非アクティブテンプレートの ProjectMovement を一括削除
      if (inactiveTemplates.length > 0) {
        const deleteResult = await tx.projectMovement.deleteMany({
          where: {
            templateId: { in: inactiveTemplates.map((t) => t.id) },
          },
        });
        deleted = deleteResult.count;
      }

      return { created, deleted };
    }, { timeout: 120000 });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
