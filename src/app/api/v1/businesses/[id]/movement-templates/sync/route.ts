import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { notifyProjectsMovementsChangedToMl } from '@/lib/ml-scope';
import { userActor } from '@/lib/update-actor';

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

    const user = session.user as { id: number; role: string; userName?: string | null };
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

      return { created, deleted, projectIds: projects.map((p) => p.id) };
    }, { timeout: 120000 });

    // 段階の構成が変わった＝ ML の読み出し（.../movements）の中身が変わる。
    // どの案件の行が増減したかは createMany/deleteMany からは分からないので、
    // 何か変わったときは事業内の案件すべてに1通ずつ送る。
    // 段階の定義を直すのは管理者の設定作業で、頻度は低い
    if (result.created > 0 || result.deleted > 0) {
      await notifyProjectsMovementsChangedToMl(prisma, userActor(user), result.projectIds);
    }

    return NextResponse.json({
      success: true,
      data: { created: result.created, deleted: result.deleted },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
