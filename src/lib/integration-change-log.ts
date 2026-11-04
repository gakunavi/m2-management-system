// ============================================
// ML管理システムから来た変更の履歴
// ============================================
//
// m2 には汎用の変更履歴テーブルが無い（更新者は updated_by ＝ User への FK だけ）。
// ML の利用者は m2 のユーザーではないため FK に載せられないので、ML 由来の変更は
// このテーブルへ「誰が・どの項目を」残す。
//
// 値そのものは保存しない。顧客名・電話・メールが履歴に溜まると、履歴を読める人の
// 範囲＝個人情報を読める人の範囲になってしまうため、変わった項目名だけを持つ。

import type { PrismaClient } from '@prisma/client';
import { logger } from '@/lib/logger';
import { isMlActor, type UpdateActor } from '@/lib/update-actor';

export type ChangeLogEntityType = 'project' | 'customer' | 'contact';
export type ChangeLogAction = 'create' | 'update' | 'delete';

export interface RecordChangeInput {
  entityType: ChangeLogEntityType;
  entityId: number;
  /** 人が読めるキー（project_no / customer_code） */
  entityKey?: string | null;
  action: ChangeLogAction;
  /** 変わった項目名。値は渡さない */
  changedFields: string[];
}

/**
 * ML 由来の変更を履歴に残す。
 *
 * 画面からの更新（actor.kind === 'user'）では何もしない。画面の更新者は
 * `updated_by` に残るため、同じことを二重に持たない。
 *
 * 履歴の書き込み失敗で更新自体を失敗させない（履歴は付帯情報）。
 */
export async function recordIntegrationChange(
  prisma: PrismaClient,
  actor: UpdateActor,
  input: RecordChangeInput,
): Promise<void> {
  if (!isMlActor(actor)) return;

  try {
    await prisma.integrationChangeLog.create({
      data: {
        entityType: input.entityType,
        entityId: input.entityId,
        entityKey: input.entityKey ?? null,
        action: input.action,
        actorLabel: actor.actorLabel,
        changedFields: input.changedFields,
      },
    });
  } catch (error) {
    logger.error('連携API: 変更履歴の記録に失敗しました', error, 'integration-change-log');
  }
}

/**
 * リクエストボディから「変わった項目名」を取り出す。
 *
 * version / 付帯情報（businessId 等）は変更項目ではないので除く。
 * ネストした customData は `projectCustomData.needs` の形で展開し、
 * **値は含めない**。
 */
export function changedFieldNames(
  body: Record<string, unknown>,
  options: { exclude?: string[]; expand?: string[] } = {},
): string[] {
  const exclude = new Set(['version', 'updatedAt', 'businessId', ...(options.exclude ?? [])]);
  const expand = new Set(options.expand ?? []);
  const names: string[] = [];

  for (const key of Object.keys(body)) {
    if (exclude.has(key)) continue;
    const value = body[key];
    if (expand.has(key) && value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const nested of Object.keys(value as Record<string, unknown>)) {
        names.push(`${key}.${nested}`);
      }
      continue;
    }
    names.push(key);
  }

  return names.sort();
}
