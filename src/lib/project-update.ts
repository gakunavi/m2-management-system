// ============================================
// 案件の更新処理（画面・ML連携の共通実装）
// ============================================
//
// `PATCH /api/v1/projects/[id]`（画面）と `PATCH /api/integrations/projects/[project_no]`
// （ML管理システム）から同じ関数を呼ぶ。入力バリデーション・楽観ロック・ステータス
// 変更に伴う副作用（確定日の自動セット・手数料の凍結・通知）を2箇所に書かないため。
//
// 権限チェックだけは呼び出し側（ルート）の責務。画面はセッションのロールで弾き、
// ML は受け付ける項目そのものを絞る（下記 ML_PROJECT_FIELDS）。
//
// レスポンスの整形は呼び出し側で行う。画面は一覧の行を丸ごと置換するため大きな
// キー集合が必要だが、ML は変わった結果の確認に足る分だけでよい。

import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '@/lib/error-handler';
import { createNotificationsForUsers } from '@/lib/notification-helper';
import { computeAllFormulas } from '@/lib/formula-evaluator';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';
import { rewardSlotsSchema } from '@/lib/reward-slots';
import { companyShareSchema } from '@/lib/company-share';
import { rewardSnapshotEditSchema } from '@/lib/reward-snapshot';
import { buildRewardSnapshotForProject } from '@/lib/reward-helpers';
import { canSeeCompanyRevenue } from '@/lib/profit-helpers';
import { updatedByFor, type UpdateActor } from '@/lib/update-actor';
import { notifyProjectChangedToMl } from '@/lib/ml-scope';

export const updateProjectSchema = z.object({
  customerId: z.number().int().positive().optional(),
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
  // 代理店支払手数料（Phase2）: 収益確定日・解約日は手動での訂正/上書きを許可する
  // （自動セットは下記ステータス変更ロジックで行う）
  revenueConfirmedAt: z.string().datetime().optional().nullable(),
  cancelledAt: z.string().datetime().optional().nullable(),
  stockTermMonths: z.number().int().positive().optional().nullable(),
  rewardOverride: rewardSlotsSchema.optional().nullable(),
  // 案件別の自社取り分上書き（例: 通常20%だがこの契約だけ15%）
  companyShareOverride: companyShareSchema.optional().nullable(),
  // 凍結スナップショットの手動訂正（管理者のみ）。「間違った料率で確定してしまった」
  // 案件を直すための経路。capturedAt / capturedBy はサーバ側で打ち直す。
  rewardSnapshot: rewardSnapshotEditSchema.optional().nullable(),
  version: z.number().int().min(1),
});

export const PROJECT_INCLUDE = {
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

export type UpdatedProject = Prisma.ProjectGetPayload<{ include: typeof PROJECT_INCLUDE }>;

export interface ApplyProjectUpdateResult {
  updated: UpdatedProject;
  statusDef: { statusLabel: string; statusColor: string | null } | null;
  /** 今回の更新でステータスが変わったか（通知・ムーブメント等の副作用の有無） */
  statusChanged: boolean;
  /** 今回の更新で収益確定した（未確定 → 確定）か */
  newlyRevenueConfirmed: boolean;
}

/**
 * 案件を1件更新する。
 *
 * 楽観ロック（version 不一致 → 409）・ステータス変更時の確定日ラッチと
 * 手数料の凍結・社内主担当者への通知まで含む。
 */
export async function applyProjectUpdate(
  prisma: PrismaClient,
  options: { projectId: number; body: unknown; actor: UpdateActor },
): Promise<ApplyProjectUpdateResult> {
  const { projectId, actor } = options;
  const data = updateProjectSchema.parse(options.body);
  const { version, projectCustomData: newCustomData, projectSalesStatus, ...updateData } = data;

  // 自社取り分は社内の収益設定。代理店ロールからの変更は受け付けない
  if (updateData.companyShareOverride !== undefined && !canSeeCompanyRevenue(actor.role)) {
    throw ApiError.forbidden('自社取り分を変更する権限がありません');
  }

  // 凍結スナップショットの手動訂正は管理者のみ。確定済み案件の金額を直接書き換える
  // 操作で、発行済みの支払明細と食い違い得るため staff にも開けない。
  if (updateData.rewardSnapshot !== undefined && actor.role !== 'admin') {
    throw ApiError.forbidden('確定済み手数料を訂正する権限がありません');
  }

  const existing = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true, version: true, projectSalesStatus: true, projectCustomData: true, businessId: true,
      revenueConfirmedAt: true, partnerId: true,
    },
  });
  if (!existing) throw ApiError.notFound('案件が見つかりません');
  if (existing.version !== version) {
    throw new ApiError('CONFLICT', '他のユーザーが変更しました。最新データを取得してください。', 409);
  }

  // 営業ステータスの確認（変更時のみ）
  let statusChangedAt: Date | undefined;
  // 代理店支払手数料の収益確定ラッチ: isRevenueConfirmed なステータスに変わった時点で自動セット。
  // 既にセット済みなら触らない（ステータスを戻しても自動では外れない）。
  let autoRevenueConfirmedAt: Date | undefined;
  if (projectSalesStatus && projectSalesStatus !== existing.projectSalesStatus) {
    const statusDefinition = await prisma.businessStatusDefinition.findFirst({
      where: { businessId: existing.businessId, statusCode: projectSalesStatus, statusIsActive: true },
    });
    if (!statusDefinition) throw ApiError.badRequest('指定された営業ステータスが見つかりません');
    statusChangedAt = new Date();
    if (statusDefinition.isRevenueConfirmed && !existing.revenueConfirmedAt) {
      autoRevenueConfirmedAt = statusChangedAt;
    }
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

  // 収益確定日・解約日: リクエストに明示指定があればそれを優先（手動での訂正/リセット）。
  // 指定が無く、かつ今回のステータス変更で自動確定した場合のみ自動セット値を使う。
  //
  // 注意: 汎用編集フォーム（use-entity-form）はGETで取得した全フィールドをそのまま
  // 送り返す実装のため、revenueConfirmedAt を一切編集していなくても body には
  // 既存値と同じ値（多くは null）が明示的に含まれる。これを「手動指定」と区別せずに
  // 扱うと、ステータス変更による自動ラッチが毎回この値で上書きされてしまう。
  // そのため、既存値と異なる場合のみ「手動指定」とみなす。
  const {
    revenueConfirmedAt: manualRevenueConfirmedAt,
    cancelledAt: manualCancelledAt,
    rewardOverride,
    companyShareOverride,
    rewardSnapshot: manualRewardSnapshot,
    ...restUpdateData
  } = updateData;
  const existingRevenueConfirmedIso = existing.revenueConfirmedAt ? existing.revenueConfirmedAt.toISOString() : null;
  const isManualRevenueConfirmedChange =
    manualRevenueConfirmedAt !== undefined && manualRevenueConfirmedAt !== existingRevenueConfirmedIso;
  const resolvedRevenueConfirmedAt = isManualRevenueConfirmedChange
    ? (manualRevenueConfirmedAt ? new Date(manualRevenueConfirmedAt) : null)
    : autoRevenueConfirmedAt;

  // ── 手数料の凍結（ラッチ）──
  // 収益確定した瞬間に、その時点の実効料率（自社受取率・代理店支払率・基準金額
  // フィールド・支払タイミング）を案件へ焼き付ける。以後マスタの料率を改定しても
  // この案件の金額は動かない。未確定の案件はスナップショットを持たないので、
  // 改定した新しい料率がそのまま反映される。
  //
  // 発火するのは「未確定 → 確定」の遷移のときだけ。確定日を別の日付へ訂正した
  // だけでは焼き直さない（料率は確定した時点のものが正なので）。
  // 逆に確定を解除（null 化）したときはスナップショットも消し、再確定で
  // 最新のマスタ料率を取り込み直せるようにする。
  const isNewlyConfirmed =
    resolvedRevenueConfirmedAt != null && existing.revenueConfirmedAt == null;
  const isUnconfirmed =
    resolvedRevenueConfirmedAt === null && existing.revenueConfirmedAt != null;

  let rewardSnapshotUpdate: Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined;
  if (manualRewardSnapshot !== undefined) {
    // 管理者による手動訂正が最優先。capturedAt / capturedBy はサーバで打ち直す
    rewardSnapshotUpdate = manualRewardSnapshot
      ? ({
          ...manualRewardSnapshot,
          capturedAt: new Date().toISOString(),
          capturedBy: 'manual',
        } as Prisma.InputJsonValue)
      : Prisma.JsonNull;
  } else if (isNewlyConfirmed) {
    const snapshot = await buildRewardSnapshotForProject(prisma, {
      businessId: existing.businessId,
      projectId,
      // 同じ PATCH で担当代理店を付け替える場合があるので更新後の値を使う。
      // DB はまだ更新前なので existing を見てはいけない。
      partnerId:
        restUpdateData.partnerId !== undefined ? restUpdateData.partnerId : existing.partnerId,
      // 報酬タブは上書きと確定日を同時に送る。更新後の値で凍結しないと、
      // 上書きを入れた当日に確定した案件だけ上書き前の料率で固まる
      ...(rewardOverride !== undefined ? { rewardOverride } : {}),
      ...(companyShareOverride !== undefined ? { companyShareOverride } : {}),
      capturedBy: 'confirm',
      capturedAt: resolvedRevenueConfirmedAt,
    });
    // 手数料管理をしていない事業（rewardConfig 未設定）は null。その場合は書かない
    if (snapshot) rewardSnapshotUpdate = snapshot as unknown as Prisma.InputJsonValue;
  } else if (isUnconfirmed) {
    rewardSnapshotUpdate = Prisma.JsonNull;
  }

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: {
      ...restUpdateData,
      ...(manualCancelledAt !== undefined && { cancelledAt: manualCancelledAt ? new Date(manualCancelledAt) : null }),
      ...(rewardOverride !== undefined && { rewardOverride: (rewardOverride ?? {}) as Prisma.InputJsonValue }),
      ...(companyShareOverride !== undefined && {
        companyShareOverride: (companyShareOverride ?? {}) as Prisma.InputJsonValue,
      }),
      ...(resolvedRevenueConfirmedAt !== undefined && { revenueConfirmedAt: resolvedRevenueConfirmedAt }),
      ...(rewardSnapshotUpdate !== undefined && { rewardSnapshot: rewardSnapshotUpdate }),
      ...(projectSalesStatus !== undefined && { projectSalesStatus }),
      ...(statusChangedAt && { projectStatusChangedAt: statusChangedAt }),
      ...(mergedCustomData !== undefined && { projectCustomData: mergedCustomData as Prisma.InputJsonValue }),
      version: { increment: 1 },
      updatedBy: updatedByFor(actor),
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
    const operatorUserId = actor.kind === 'user' ? actor.userId : null;
    void (async () => {
      try {
        const notifyUserIds: number[] = [];

        // 1. 社内主担当者（操作者自身は除外）
        if (updated.projectAssignedUserId && updated.projectAssignedUserId !== operatorUserId) {
          notifyUserIds.push(updated.projectAssignedUserId);
        }

        // 代理店（partner_admin）へのステータス変更通知は送らない
        // （社内の主担当者のみに通知する運用）

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

  // ML管理システムへ「変わったよ」を通知（ライト事業の案件のみ・本文はキーだけ）。
  // ML 由来の更新・env 未設定・対象外事業は内側で弾かれる（ループ防止）。
  // 送信はレスポンス後に回すので、編集した人は待たない。
  await notifyProjectChangedToMl(prisma, actor, {
    businessId: updated.businessId,
    projectNo: updated.projectNo,
  });

  return {
    updated,
    statusDef,
    statusChanged: statusChangedAt !== undefined,
    newlyRevenueConfirmed: isNewlyConfirmed,
  };
}
