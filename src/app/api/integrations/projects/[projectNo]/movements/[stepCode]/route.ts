import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { findIntegrationProjectByNo } from '@/lib/ml-scope';
import {
  handleIntegrationWrite,
  IDEMPOTENCY_SCOPE_ML_MOVEMENT,
  once,
} from '@/lib/integration-write';
import { applyMovementUpdate } from '@/lib/project-movement-update';
import {
  buildMlMovementItem,
  mlMovementPatchSchema,
  toMovementUpdateFields,
} from '@/lib/ml-movement-fields';
import { recordIntegrationChange } from '@/lib/integration-change-log';

export const dynamic = 'force-dynamic';

// ============================================================================
// PATCH /api/integrations/projects/{project_no}/movements/{step_code}
//        （認証: 書き込み用トークン）
//
// 段階の状態・開始日・完了日を直す。ほかの書き込み口と同じ決まり:
//
// - 書き込み用トークン（読み取り用では 401）
// - X-ML-User（変更履歴に "ML：<名前>" として残る）
// - Idempotency-Key（同じキー＋同じ内容の再送は1回だけ反映）
// - 楽観ロック … `updated_at`（`project_movements` に version カラムが無い）
// - ライト事業以外の案件・知らない step_code は 404
// - 知らないキー・状態の値違い・日付の形式違いは 422
//
// 更新は画面と同じ共通処理（src/lib/project-movement-update.ts）を通るので、
// 状態に応じた日付の自動セットが ML 経由でも同じように起きる。
// ============================================================================

/** 409 のときに返す現在値 */
async function currentMovement(projectId: number, stepCode: string) {
  const movement = await prisma.projectMovement.findFirst({
    where: { projectId, template: { stepCode } },
    select: {
      movementStatus: true,
      movementStartedAt: true,
      movementCompletedAt: true,
      updatedAt: true,
      template: { select: { stepNumber: true, stepCode: true, stepName: true } },
    },
  });
  return movement ? buildMlMovementItem(movement) : null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectNo: string; stepCode: string }> },
) {
  const { projectNo: rawProjectNo, stepCode: rawStepCode } = await params;
  const projectNo = decodeURIComponent(rawProjectNo);
  const stepCode = decodeURIComponent(rawStepCode);
  // 認証前に DB を叩かないよう、対象の解決は handler の中まで遅延させる
  const resolveScope = once(() => findIntegrationProjectByNo(prisma, projectNo));

  return handleIntegrationWrite(request, {
    scope: IDEMPOTENCY_SCOPE_ML_MOVEMENT,
    resourceKey: `project:${projectNo}:movement:${stepCode}`,
    logContext: 'ml-movement-write',
    onConflict: async () => {
      const scope = await resolveScope();
      return scope ? currentMovement(scope.projectId, stepCode) : null;
    },
    handler: async ({ actor, body }) => {
      const scope = await resolveScope();
      if (!scope) return { status: 404, body: { error: 'Not found' } };

      const input = mlMovementPatchSchema.parse(body);

      // 画面と同じ更新処理。段階の指定だけが step_code（ML は m2 の id を持たない）
      const updated = await applyMovementUpdate(prisma, {
        projectId: scope.projectId,
        target: { kind: 'stepCode', stepCode },
        fields: toMovementUpdateFields(input),
        actor,
        expectedUpdatedAt: input.updated_at,
      });

      await recordIntegrationChange(prisma, actor, {
        entityType: 'movement',
        entityId: updated.id,
        // 案件Noと段階が分かるように（IDだけでは追えない）
        entityKey: `${scope.projectNo}:${updated.template.stepCode}`,
        action: 'update',
        // 値は残さない。ML が送ってきた項目名だけ
        changedFields: Object.keys(input).filter((k) => k !== 'updated_at').sort(),
      });

      return { status: 200, body: buildMlMovementItem(updated) };
    },
  });
}
