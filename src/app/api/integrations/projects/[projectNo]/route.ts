import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeIntegrationRequest } from '@/lib/integration-auth';
import { projectAdminUrl } from '@/lib/integration-url';
import { logger } from '@/lib/logger';
import { findIntegrationProjectByNo } from '@/lib/ml-scope';
import {
  handleIntegrationWrite,
  IDEMPOTENCY_SCOPE_ML_PROJECT,
  once,
} from '@/lib/integration-write';
import { applyProjectUpdate } from '@/lib/project-update';
import {
  assertNoFormulaFields,
  buildMlProjectItem,
  mlProjectPatchSchema,
  projectCustomFieldsReadOnlyKeys,
  toProjectUpdateBody,
} from '@/lib/ml-project-fields';
import { assertCustomFieldsWritable } from '@/lib/ml-custom-fields';
import { recordIntegrationChange } from '@/lib/integration-change-log';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';

export const dynamic = 'force-dynamic';

// ============================================================================
// GET   /api/integrations/projects/{project_no}   （認証: 読み取り用トークン）
// PATCH /api/integrations/projects/{project_no}   （認証: 書き込み用トークン）
//
// ML管理システムが写しで持っている案件項目の読み書き。
//
// - 対象: env INTEGRATION_BUSINESS_CODE（既定 LIGHT）の案件のみ。それ以外は 404
// - GET は PATCH 前に `version` を取るための口。契約読み出しAPI
//   （GET /api/integrations/contracts）は version を返さないので、編集画面を
//   開く直前にここを読む
// - PATCH は画面の更新処理（src/lib/project-update.ts）をそのまま通る。
//   ステータス変更に伴う副作用（確定日の自動セット・手数料の凍結・社内主担当者への
//   通知）が ML 経由でも同じように起きる
// ============================================================================

/** 事業設定のカスタム項目定義（案件） */
async function loadProjectFieldDefs(businessId: number): Promise<ProjectFieldDefinition[]> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { businessConfig: true },
  });
  return (
    (business?.businessConfig as { projectFields?: ProjectFieldDefinition[] } | null)
      ?.projectFields ?? []
  );
}

/** 案件1件をML向けの形で読む（GET・409 の current で共用） */
async function readMlProject(projectId: number) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      projectNo: true,
      projectSalesStatus: true,
      projectStatusChangedAt: true,
      projectExpectedCloseMonth: true,
      projectAssignedUserName: true,
      projectCustomData: true,
      version: true,
      businessId: true,
      customer: { select: { customerCode: true } },
    },
  });
  if (!project) return null;

  const [statusDef, projectFieldDefs] = await Promise.all([
    prisma.businessStatusDefinition.findFirst({
      where: { businessId: project.businessId, statusCode: project.projectSalesStatus },
      select: { statusLabel: true },
    }),
    loadProjectFieldDefs(project.businessId),
  ]);

  return buildMlProjectItem(project, {
    statusLabel: statusDef?.statusLabel ?? null,
    projectUrl: projectAdminUrl(project.id),
    projectFieldDefs,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectNo: string }> },
) {
  const auth = authorizeIntegrationRequest(request, 'read');
  if (!auth.ok) return auth.response;

  try {
    const { projectNo } = await params;
    const scope = await findIntegrationProjectByNo(prisma, decodeURIComponent(projectNo));
    if (!scope) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const item = await readMlProject(scope.projectId);
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json(item);
  } catch (error) {
    logger.error('連携API(projects): 案件の読み出しに失敗しました', error, 'ml-project-read');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectNo: string }> },
) {
  const { projectNo: rawProjectNo } = await params;
  const projectNo = decodeURIComponent(rawProjectNo);
  // 認証前に DB を叩かないよう、対象の解決は handler の中まで遅延させる
  const resolveScope = once(() => findIntegrationProjectByNo(prisma, projectNo));

  return handleIntegrationWrite(request, {
    scope: IDEMPOTENCY_SCOPE_ML_PROJECT,
    resourceKey: `project:${projectNo}`,
    logContext: 'ml-project-write',
    onConflict: async () => {
      const scope = await resolveScope();
      return scope ? readMlProject(scope.projectId) : null;
    },
    handler: async ({ actor, body }) => {
      const scope = await resolveScope();
      if (!scope) return { status: 404, body: { error: 'Not found' } };

      const input = mlProjectPatchSchema.parse(body);

      const projectFields = await loadProjectFieldDefs(scope.businessId);

      // 数式項目（購入金額＝単価×台数）への書き込みは 422。
      // 共通の更新処理が保存前に再計算するため、受け付けると黙って消える
      assertNoFormulaFields(input, projectFields);

      // 専用キーの無いカスタム項目は定義と突き合わせる
      // （未定義キー・計算項目・型違い・選択肢違反・専用キーのある項目は 422）
      if (input.custom_fields !== undefined) {
        assertCustomFieldsWritable(input.custom_fields, projectFields, {
          scope: 'custom_fields',
          readOnlyKeys: projectCustomFieldsReadOnlyKeys(),
        });
      }

      // 画面と同じ更新処理。ML だと分かるのは actor だけで、ロジックは共通
      const { updated, statusDef } = await applyProjectUpdate(prisma, {
        projectId: scope.projectId,
        body: toProjectUpdateBody(input),
        actor,
      });

      await recordIntegrationChange(prisma, actor, {
        entityType: 'project',
        entityId: updated.id,
        entityKey: updated.projectNo,
        action: 'update',
        // 値は残さない。ML が送ってきた項目名だけ
        changedFields: Object.keys(input).filter((k) => k !== 'version').sort(),
      });

      return {
        status: 200,
        body: buildMlProjectItem(updated, {
          statusLabel: statusDef?.statusLabel ?? null,
          projectUrl: projectAdminUrl(updated.id),
          projectFieldDefs: projectFields,
        }),
      };
    },
  });
}
