// ============================================
// 案件ムーブメント（段階）の更新ロジック（画面とML連携の共通処理）
// ============================================
//
// **ライト事業の案件ムーブメントは、営業管理システムと ML のどちらからでも直せて、
// いつも同じ値にする**（2026-11-08 石井さん）。ML の業務ムーブメント「MO受注」と
// ライト事業の段階（工業会証明書発行・中企庁認定・申込書取得・販売契約書締結・
// 着金確認・共同運用契約書締結・共有フォルダ案内）は同じものなので、今まで両方に
// 手で入れていたのをつなぐ。
//
// 画面（PATCH /api/v1/projects/:id/movements/:movementId）と ML
// （PATCH /api/integrations/projects/{project_no}/movements/{step_code}）が
// この1本を通る。コピーして別経路を書くと、状態に応じた日付の自動セットや
// ML への通知が片方だけに入る。
//
// 対象の指定だけが違う:
//   - 画面 … ムーブメントの id（一覧で引いた行をそのまま編集する）
//   - ML   … step_code（ML 側は m2 の内部 id を持たない）
//
// 楽観ロックは `updatedAt`。`ProjectMovement` に version カラムが無いため
// （担当者と同じ扱い）。画面からは渡していない（従来の挙動を変えない）。

import type { Prisma, PrismaClient } from '@prisma/client';
import { ApiError } from '@/lib/error-handler';
import { notifyProjectChangedToMl, notifyProjectMovementsChangedToMl } from '@/lib/ml-scope';
import { updatedByFor, type UpdateActor } from '@/lib/update-actor';
import type { MovementStatus } from '@/lib/validations/movement';

export interface MovementUpdateFields {
  movementStatus?: MovementStatus;
  movementNotes?: string | null;
  /** ISO 8601 もしくは 'YYYY-MM-DD'。null で空にする */
  movementStartedAt?: string | null;
  movementCompletedAt?: string | null;
  /** 連動フィールド（案件のカスタム項目）の同時更新。ML からは受け付けない */
  linkedFieldUpdate?: { key: string; value: string | number | boolean | null };
}

/** 更新対象の指定。画面は id、ML は step_code */
export type MovementTarget =
  | { kind: 'id'; movementId: number }
  | { kind: 'stepCode'; stepCode: string };

export interface ApplyMovementUpdateArgs {
  projectId: number;
  target: MovementTarget;
  fields: MovementUpdateFields;
  actor: UpdateActor;
  /** 楽観ロック用。編集前に読んだ `updatedAt`（ISO 8601）。指定時に違えば 409 */
  expectedUpdatedAt?: string;
}

const TEMPLATE_SELECT = {
  id: true,
  stepNumber: true,
  stepCode: true,
  stepName: true,
  stepDescription: true,
  stepLinkedFieldKey: true,
} as const;

export type UpdatedMovement = Prisma.ProjectMovementGetPayload<{
  include: { template: { select: typeof TEMPLATE_SELECT } };
}>;

/**
 * ムーブメントの楽観ロック判定。
 *
 * `updatedAt` はミリ秒まで持つので、ISO 文字列の素朴な一致ではなく
 * 時刻としての一致で見る（同じ時刻でも表記の違いで落ちるのを避ける）。
 */
export function assertMovementNotStale(current: Date, expectedIso: string): void {
  const expected = new Date(expectedIso);
  if (Number.isNaN(expected.getTime())) {
    throw ApiError.badRequest('updatedAt は ISO 8601 形式で指定してください');
  }
  if (current.getTime() !== expected.getTime()) {
    throw ApiError.conflict('他のユーザーによって更新されています。最新データを取得してください。');
  }
}

/**
 * 段階を1つ更新する。
 *
 * 日付は「明示指定があればそれを使い、無ければ状態から自動で入れる」。
 * 自動セットの規則は**画面の編集モーダルと同じ**にしてある:
 *   started     … 開始日が空なら今を入れ、完了日を空にする
 *   completed   … 開始日が空なら今を入れ、完了日に今を入れる
 *   skipped     … 完了日を空にする（開始日はそのまま）
 *   pending     … 開始日・完了日を空にする
 *   unnecessary … 開始日・完了日を空にする（やらない段階なので日付を持たせない）
 *
 * 画面の編集モーダルは状態を変えるたびに日付欄を書き換え、保存時は必ず両方の日付を
 * 送ってくるので、この自動セットを通るのは実際には ML からの「状態だけ送る」更新。
 * **規則が画面とズレていると「ML で飛ばすと完了日が入り、画面で飛ばすと入らない」に
 * なる**ため、skipped は画面と揃えて完了日を空にする（以前はここだけ「今」を入れて
 * いたが、画面からその値になることは無かった）。
 */
export async function applyMovementUpdate(
  prisma: PrismaClient,
  args: ApplyMovementUpdateArgs,
): Promise<UpdatedMovement> {
  const { projectId, target, fields, actor } = args;

  const existing = await prisma.projectMovement.findFirst({
    where:
      target.kind === 'id'
        ? { id: target.movementId, projectId }
        : { projectId, template: { stepCode: target.stepCode } },
    include: {
      project: { select: { id: true, projectNo: true, businessId: true } },
      template: { select: { stepLinkedFieldKey: true, stepName: true } },
    },
  });
  if (!existing) throw ApiError.notFound('ムーブメントが見つかりません');

  if (args.expectedUpdatedAt !== undefined) {
    assertMovementNotStale(existing.updatedAt, args.expectedUpdatedAt);
  }

  const now = new Date();

  // タイムスタンプの設定（明示的な日付指定がある場合はそちらを優先）
  const timestamps: {
    movementStartedAt?: Date | null;
    movementCompletedAt?: Date | null;
  } = {};

  if (fields.movementStartedAt !== undefined) {
    timestamps.movementStartedAt = fields.movementStartedAt
      ? new Date(fields.movementStartedAt)
      : null;
  }
  if (fields.movementCompletedAt !== undefined) {
    timestamps.movementCompletedAt = fields.movementCompletedAt
      ? new Date(fields.movementCompletedAt)
      : null;
  }

  // 明示的な日付指定がない場合のみ、ステータスに応じた自動設定
  if (
    fields.movementStatus &&
    fields.movementStartedAt === undefined &&
    fields.movementCompletedAt === undefined
  ) {
    switch (fields.movementStatus) {
      case 'started':
        timestamps.movementStartedAt = existing.movementStartedAt ?? now;
        timestamps.movementCompletedAt = null;
        break;
      case 'completed':
        timestamps.movementStartedAt = existing.movementStartedAt ?? now;
        timestamps.movementCompletedAt = now;
        break;
      case 'skipped':
        timestamps.movementCompletedAt = null;
        break;
      case 'pending':
        timestamps.movementStartedAt = null;
        timestamps.movementCompletedAt = null;
        break;
      case 'unnecessary':
        timestamps.movementStartedAt = null;
        timestamps.movementCompletedAt = null;
        break;
    }
  }

  // 連動フィールドを実際に書いたか（案件のカスタム項目が変わるので、段階とは別に
  // 案件の変更としても知らせる必要がある）
  let linkedFieldWritten = false;

  // トランザクション: ムーブメント更新 + 連動フィールド更新
  const updated = await prisma.$transaction(async (tx) => {
    const movement = await tx.projectMovement.update({
      where: { id: existing.id },
      data: {
        ...(fields.movementStatus !== undefined && { movementStatus: fields.movementStatus }),
        ...(fields.movementNotes !== undefined && { movementNotes: fields.movementNotes || null }),
        ...timestamps,
        updatedBy: updatedByFor(actor),
      },
      include: { template: { select: TEMPLATE_SELECT } },
    });

    // 連動フィールド更新: linkedFieldUpdate が送信された場合
    if (fields.linkedFieldUpdate) {
      const { key, value } = fields.linkedFieldUpdate;
      // テンプレートの連動フィールドキーと一致するか検証
      if (existing.template.stepLinkedFieldKey && key === existing.template.stepLinkedFieldKey) {
        const project = await tx.project.findUniqueOrThrow({
          where: { id: projectId },
          select: { projectCustomData: true },
        });
        const currentCustomData = (project.projectCustomData ?? {}) as Record<string, unknown>;
        const updatedCustomData = { ...currentCustomData, [key]: value };

        await tx.project.update({
          where: { id: projectId },
          data: {
            projectCustomData: updatedCustomData as Prisma.InputJsonValue,
            updatedBy: updatedByFor(actor),
            version: { increment: 1 },
          },
        });
        linkedFieldWritten = true;
      }
    }

    return movement;
  });

  // ML管理システムへ「段階が変わったよ」を通知（ライト事業のみ・本文はキーだけ）。
  // ML 由来の更新・env 未設定・対象外事業は内側で弾かれる（ループ防止）。
  await notifyProjectMovementsChangedToMl(prisma, actor, {
    businessId: existing.project.businessId,
    projectNo: existing.project.projectNo,
  });

  // 連動フィールドを書いたときは案件のカスタム項目も変わっている。
  // ML は案件本体を別の口で読むので、段階の知らせだけでは気づけない
  if (linkedFieldWritten) {
    await notifyProjectChangedToMl(prisma, actor, {
      businessId: existing.project.businessId,
      projectNo: existing.project.projectNo,
    });
  }

  return updated;
}
