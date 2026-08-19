import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import {
  buildRewardSnapshot,
  loadBusinessRewardContext,
  resolvePartnerChain,
  toProjectRewardInput,
} from '@/lib/reward-helpers';
import { parseRewardSnapshot } from '@/lib/reward-snapshot';

// ============================================
// 既存の収益確定済み案件へのスナップショット一括付与（移行用）
// ============================================
//
// 凍結の仕組みを入れる前に確定した案件はスナップショットを持たないため、
// そのままではマスタの料率を改定した瞬間に過去の粗利が動いてしまう。
// 移行時に「いま計算されている実効料率」をそのまま焼き付けることで、
// 実行の前後で金額を1円も変えずに、以後の改定から過去を守れるようにする。
//
// 冪等: 既にスナップショットを持つ案件は触らない。何度実行しても安全。
//
// capturedAt は「凍結した日時」であって「確定した日時」ではない。焼き付ける値は
// 実行時点のマスタ設定なので、確定日を入れると「確定時の料率を保存した」という
// 誤った意味になる。区別できるよう capturedBy に 'backfill' を立てる。

export interface BackfillResult {
  /** 対象になった事業数（rewardConfig を持つ事業のみ） */
  businesses: number;
  /** 走査した収益確定済み案件数 */
  scanned: number;
  /** スナップショットを書いた案件数 */
  written: number;
  /** 既にスナップショットを持っていて飛ばした案件数 */
  alreadyFrozen: number;
  /** 事業ごとの内訳（businessId → 書き込み件数） */
  writtenByBusiness: Record<number, number>;
}

/**
 * 収益確定済みかつ未凍結の案件すべてにスナップショットを付与する。
 *
 * @param options.businessId 指定時はその事業だけを対象にする
 * @param options.dryRun true なら件数を数えるだけで書き込まない
 */
export async function backfillRewardSnapshots(
  prisma: PrismaClient,
  options: { businessId?: number; dryRun?: boolean } = {},
): Promise<BackfillResult> {
  const capturedAt = new Date();

  const businesses = await prisma.business.findMany({
    where: options.businessId ? { id: options.businessId } : {},
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  const result: BackfillResult = {
    businesses: 0,
    scanned: 0,
    written: 0,
    alreadyFrozen: 0,
    writtenByBusiness: {},
  };

  for (const biz of businesses) {
    // 手数料管理をしていない事業（rewardConfig 未設定）は ctx が null。凍結する物が無い
    const ctx = await loadBusinessRewardContext(prisma, biz.id);
    if (!ctx) continue;
    result.businesses += 1;

    for (const row of ctx.projects) {
      result.scanned += 1;
      if (parseRewardSnapshot(row.rewardSnapshot)) {
        result.alreadyFrozen += 1;
        continue;
      }

      const project = toProjectRewardInput(row);
      const chain = resolvePartnerChain(row.partnerId, ctx.linkByPartner);
      const snapshot = buildRewardSnapshot(ctx.config, chain, project, 'backfill', capturedAt);

      if (!options.dryRun) {
        // version は上げない。料率の実効値は変わらず、UI 上の見え方も変わらないため、
        // 編集中のユーザーに 409 を出す理由が無い
        await prisma.project.update({
          where: { id: row.id },
          data: { rewardSnapshot: snapshot as unknown as Prisma.InputJsonValue },
        });
      }
      result.written += 1;
      result.writtenByBusiness[biz.id] = (result.writtenByBusiness[biz.id] ?? 0) + 1;
    }
  }

  return result;
}
