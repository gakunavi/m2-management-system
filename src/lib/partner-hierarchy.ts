// ============================================
// 代理店階層管理ユーティリティ
// ============================================

import type { PrismaClient } from '@prisma/client';

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/**
 * 階層番号（tierNumber）を生成する
 *
 * - 1次代理店（parentId = null）: 代理店コード（例: "AG-0001"）
 * - 2次代理店（parentId → 1次）: 親のtierNumber + "-1", "-2"…
 * - 3次代理店（parentId → 2次）: 親のtierNumber + "-1-1", "-1-2"…
 *
 * 兄弟の連番は既存MAXから+1（削除後も重複しない）
 */
export async function generateTierNumber(
  tx: TxClient,
  partnerTier: string | null,
  parentId: number | null,
  partnerCode: string,
): Promise<string | null> {
  // 階層ラベルが未設定なら tierNumber も null
  if (!partnerTier) return null;

  if (partnerTier === '1次代理店' || !parentId) {
    // 1次代理店: 代理店コードそのもの
    return partnerCode;
  }

  // 2次・3次: 親の tierNumber を取得して子連番を付与
  const parent = await tx.partner.findUnique({
    where: { id: parentId },
    select: { partnerTierNumber: true },
  });
  if (!parent?.partnerTierNumber) return null;

  // 既存の兄弟から連番の最大値を取得
  const siblings = await tx.partner.findMany({
    where: {
      parentId,
      partnerTierNumber: { not: null, startsWith: `${parent.partnerTierNumber}-` },
    },
    select: { partnerTierNumber: true },
  });

  let maxSeq = 0;
  const prefix = `${parent.partnerTierNumber}-`;
  for (const s of siblings) {
    if (!s.partnerTierNumber) continue;
    const suffix = s.partnerTierNumber.slice(prefix.length);
    // 直接の子の連番のみ（"-1" は OK、"-1-1" はスキップ）
    if (!suffix.includes('-')) {
      const num = parseInt(suffix, 10);
      if (!isNaN(num) && num > maxSeq) maxSeq = num;
    }
  }

  return `${parent.partnerTierNumber}-${maxSeq + 1}`;
}

/**
 * 指定代理店の全子孫の tierNumber を再計算する
 * 親変更時に呼び出す
 */
export async function recalculateDescendantTierNumbers(
  tx: TxClient,
  partnerId: number,
): Promise<void> {
  const partner = await tx.partner.findUnique({
    where: { id: partnerId },
    select: { id: true, partnerTier: true, partnerTierNumber: true },
  });
  if (!partner) return;

  // 親の階層深さを取得（N次対応: 子は N+1 次）
  const parentDepth = partner.partnerTier ? getTierDepth(partner.partnerTier) : null;
  const childTierLabel = parentDepth ? getTierLabel(parentDepth + 1) : null;

  const children = await tx.partner.findMany({
    where: { parentId: partnerId },
    orderBy: { id: 'asc' },
    select: { id: true },
  });

  for (let i = 0; i < children.length; i++) {
    const childTierNumber = partner.partnerTierNumber
      ? `${partner.partnerTierNumber}-${i + 1}`
      : null;

    await tx.partner.update({
      where: { id: children[i].id },
      data: {
        partnerTierNumber: childTierNumber,
        ...(childTierLabel ? { partnerTier: childTierLabel } : {}),
      },
    });

    // 再帰的に孫も更新
    await recalculateDescendantTierNumbers(tx, children[i].id);
  }
}

/**
 * 全代理店のグループ全体の階層番号を再計算する（マイグレーション用）
 * 1次 → 代理店コード、N次 → 親のtierNumber + 連番
 */
export async function recalculateAllTierNumbers(
  tx: TxClient,
): Promise<void> {
  // 1次代理店を全て更新: tierNumber = partnerCode
  const roots = await tx.partner.findMany({
    where: { partnerTier: '1次代理店' },
    orderBy: { id: 'asc' },
    select: { id: true, partnerCode: true },
  });

  for (const root of roots) {
    await tx.partner.update({
      where: { id: root.id },
      data: { partnerTierNumber: root.partnerCode },
    });

    // 子孫を再帰的に再計算
    await recalculateDescendantTierNumbers(tx, root.id);
  }
}

/**
 * ルート祖先の ID を取得する（代理店グループタブ用）
 */
export async function findRootPartnerId(
  tx: TxClient,
  partnerId: number,
): Promise<number> {
  let currentId = partnerId;

  // 最大10段階まで（無限ループ防止）
  for (let depth = 0; depth < 10; depth++) {
    const partner = await tx.partner.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    });
    if (!partner || !partner.parentId) return currentId;
    currentId = partner.parentId;
  }

  return currentId;
}

/**
 * 循環参照チェック
 * newParentId が partnerId の子孫でないことを検証する
 */
export async function detectCircularReference(
  tx: TxClient,
  partnerId: number,
  newParentId: number | null,
): Promise<boolean> {
  if (!newParentId) return false;
  if (newParentId === partnerId) return true;

  let currentId = newParentId;

  // 最大10段階まで
  for (let depth = 0; depth < 10; depth++) {
    const found = await tx.partner.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    });
    if (!found || !found.parentId) return false;
    if (found.parentId === partnerId) return true;
    currentId = found.parentId;
  }

  return false;
}

/**
 * 階層の深さから階層ラベルを生成する（N次対応）
 * depth=1 → '1次代理店', depth=2 → '2次代理店', ...
 */
export function getTierLabel(depth: number): string {
  return `${depth}次代理店`;
}

/**
 * 階層ラベルから深さを取得する
 * '1次代理店' → 1, '2次代理店' → 2, ...
 */
export function getTierDepth(tierLabel: string): number | null {
  const match = tierLabel.match(/^(\d+)次代理店$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * 親代理店の階層から子の階層ラベルを算出する
 * 親が null → '1次代理店'
 * 親が tier 未設定 → 親を自動的に1次代理店に昇格し、子は '2次代理店'
 * 親が 'N次代理店' → '(N+1)次代理店'
 */
export async function calculateTierFromParent(
  tx: TxClient,
  parentId: number | null,
): Promise<string> {
  if (!parentId) return '1次代理店';

  const parent = await tx.partner.findUnique({
    where: { id: parentId },
    select: { partnerTier: true, partnerCode: true },
  });
  if (!parent) return '1次代理店';

  // 親が tier 未設定の場合、親を1次代理店に自動昇格
  if (!parent.partnerTier) {
    const tierNumber = await generateTierNumber(tx, '1次代理店', null, parent.partnerCode);
    await tx.partner.update({
      where: { id: parentId },
      data: {
        partnerTier: '1次代理店',
        partnerTierNumber: tierNumber,
        parentId: null,
      },
    });
    return '2次代理店';
  }

  const parentDepth = getTierDepth(parent.partnerTier);
  if (!parentDepth) return '1次代理店';

  return getTierLabel(parentDepth + 1);
}

/**
 * 階層ラベル（partnerTier）と親代理店の階層整合性を検証する（N次対応）
 * - 1次代理店 → parentId は null であるべき
 * - N次代理店 → 親は (N-1)次代理店
 */
export async function validateTierHierarchy(
  tx: TxClient,
  partnerTier: string | null,
  parentId: number | null,
): Promise<string | null> {
  if (!partnerTier) return null;

  const depth = getTierDepth(partnerTier);
  if (!depth) return `不正な階層ラベルです: ${partnerTier}`;

  if (depth === 1) {
    if (parentId) return '1次代理店は親代理店を設定できません';
    return null;
  }

  // N次(N>=2)は親が必須
  if (!parentId) {
    const parentTierLabel = getTierLabel(depth - 1);
    return `${partnerTier}は親代理店（${parentTierLabel}）の選択が必須です`;
  }

  const parent = await tx.partner.findUnique({
    where: { id: parentId },
    select: { partnerTier: true },
  });
  if (!parent) return '指定された親代理店が見つかりません';

  const expectedParentTier = getTierLabel(depth - 1);
  if (parent.partnerTier !== expectedParentTier) {
    return `${partnerTier}の親は${expectedParentTier}である必要があります`;
  }

  return null;
}
