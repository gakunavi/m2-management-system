import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeIntegrationRequest } from '@/lib/integration-auth';
import { projectAdminUrl } from '@/lib/integration-url';
import { logger } from '@/lib/logger';
import { findIntegrationProjectByNo } from '@/lib/ml-scope';
import { buildMlMovementItem, movementStatusOptions } from '@/lib/ml-movement-fields';

export const dynamic = 'force-dynamic';

// ============================================================================
// GET /api/integrations/projects/{project_no}/movements   （認証: 読み取り用トークン）
//
// 案件の段階（ムーブメント）を全部返す。ML の業務ムーブメント「MO受注」と同じ段階。
//
// - 対象: env INTEGRATION_BUSINESS_CODE（既定 LIGHT）の案件のみ。それ以外は 404
// - 段階の並びは事業マスタのムーブメント定義の順（step_number 昇順）
// - 各段階の `updated_at` は PATCH の楽観ロックで送り返す値
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectNo: string }> },
) {
  const auth = authorizeIntegrationRequest(request, 'read');
  if (!auth.ok) return auth.response;

  try {
    const { projectNo } = await params;
    const scope = await findIntegrationProjectByNo(prisma, decodeURIComponent(projectNo));
    // 事業外・論理削除済み・存在しないを区別せず 404
    if (!scope) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const movements = await prisma.projectMovement.findMany({
      where: { projectId: scope.projectId },
      orderBy: { template: { stepNumber: 'asc' } },
      select: {
        movementStatus: true,
        movementStartedAt: true,
        movementCompletedAt: true,
        updatedAt: true,
        template: { select: { stepNumber: true, stepCode: true, stepName: true } },
      },
    });

    return NextResponse.json({
      project_no: scope.projectNo,
      project_url: projectAdminUrl(scope.projectId),
      meta: {
        count: movements.length,
        // ML が状態の選択肢を自前で持たなくて済むように添える
        status_options: movementStatusOptions(),
      },
      items: movements.map(buildMlMovementItem),
    });
  } catch (error) {
    logger.error('連携API(movements): 段階の読み出しに失敗しました', error, 'ml-movement-read');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
