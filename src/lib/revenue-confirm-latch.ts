import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { buildRewardSnapshotForProject } from '@/lib/reward-helpers';

// ============================================
// 収益確定のラッチ（確定日のセット＋手数料の凍結）
// ============================================
//
// 「営業ステータスが収益確定対象（isRevenueConfirmed）なのに revenueConfirmedAt が
// 未設定」の案件へ、確定日と凍結スナップショットをまとめて付ける。
//
// PATCH /projects/[id] は自前でラッチを持っている（手動での日付訂正・確定解除・
// 管理者によるスナップショット訂正まで扱うため）。ここは案件を「作る」側の経路
// （新規作成POST・CSV取り込み）向けで、書き込み後の後処理として呼ぶ。
//
// 作成系の経路にラッチが無いと、CSV取り込みで購入済みになった案件が永久に
// 未確定・未凍結のまま残り、料率を改定するたびに過去の粗利が動く。実際に本番で
// 5件取りこぼしていた（`/api/v1/rewards/warnings` が検出用に用意されているが、
// 人が見て手で直す前提の安全網でしかない）。
//
// 冪等: 既に revenueConfirmedAt が入っている案件は対象外なので、何度呼んでも安全。

export interface RevenueLatchResult {
  /** 新たに確定・凍結した件数 */
  latched: number;
  projectIds: number[];
}

/**
 * 収益確定ステータスなのに未確定の案件へ、確定日と凍結スナップショットを付ける。
 *
 * @param options.projectIds 指定時はその案件だけを対象にする。
 *   省略すると事業全体を走査するので、取りこぼしの一括修復にも使える。
 */
export async function latchRevenueConfirmation(
  prisma: PrismaClient,
  businessId: number,
  options: { projectIds?: number[] } = {},
): Promise<RevenueLatchResult> {
  if (options.projectIds && options.projectIds.length === 0) {
    return { latched: 0, projectIds: [] };
  }

  const confirmedStatuses = await prisma.businessStatusDefinition.findMany({
    where: { businessId, isRevenueConfirmed: true, statusIsActive: true },
    select: { statusCode: true },
  });
  // 収益確定ステータスを1つも定義していない事業は、そもそも報酬管理をしていない
  if (confirmedStatuses.length === 0) return { latched: 0, projectIds: [] };

  const targets = await prisma.project.findMany({
    where: {
      businessId,
      projectIsActive: true,
      revenueConfirmedAt: null,
      projectSalesStatus: { in: confirmedStatuses.map((s) => s.statusCode) },
      ...(options.projectIds ? { id: { in: options.projectIds } } : {}),
    },
    select: { id: true, partnerId: true, projectStatusChangedAt: true },
  });

  const projectIds: number[] = [];
  for (const t of targets) {
    // 計上月は「そのステータスになった月」。PATCH 経由のラッチ（statusChangedAt を
    // 確定日にする）と揃える。取り込み直後は statusChangedAt が入っているが、
    // 万一無ければ現在時刻にフォールバックする
    const confirmedAt = t.projectStatusChangedAt ?? new Date();

    const snapshot = await buildRewardSnapshotForProject(prisma, {
      businessId,
      projectId: t.id,
      partnerId: t.partnerId,
      capturedBy: 'confirm',
      capturedAt: confirmedAt,
    });

    await prisma.project.update({
      where: { id: t.id },
      data: {
        revenueConfirmedAt: confirmedAt,
        // 手数料設定の無い事業では snapshot が null。確定日だけ入れて凍結はしない
        ...(snapshot ? { rewardSnapshot: snapshot as unknown as Prisma.InputJsonValue } : {}),
        // version は上げない。呼び出し元（作成・取り込み）が直前に書き込んだ
        // 直後の後処理であり、ここで更に上げると同じ操作で2回上がる
      },
    });
    projectIds.push(t.id);
  }

  return { latched: projectIds.length, projectIds };
}
