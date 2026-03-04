// ============================================
// 代理店階層管理ユーティリティ
// ============================================

import type { PrismaClient } from '@prisma/client';

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/**
 * 階層番号（tierNumber）を生成する
 *
 * - 1次代理店（parentId = null）: "1", "2", "3"…
 * - 2次代理店（parentId → 1次）: "1-1", "1-2"…
 * - 3次代理店（parentId → 2次）: "1-1-1", "1-1-2"…
 */
export async function generateTierNumber(
  tx: TxClient,
  partnerTier: string | null,
  parentId: number | null,
): Promise<string | null> {
  // 階層ラベルが未設定なら tierNumber も null
  if (!partnerTier) return null;

  if (partnerTier === '1次代理店' || !parentId) {
    // 1次代理店: ルートレベルの連番
    const siblings = await tx.partner.count({
      where: {
        parentId: null,
        partnerTier: '1次代理店',
        partnerTierNumber: { not: null },
      },
    });
    return String(siblings + 1);
  }

  // 2次・3次: 親の tierNumber を取得して子連番を付与
  const parent = await tx.partner.findUnique({
    where: { id: parentId },
    select: { partnerTierNumber: true },
  });
  if (!parent?.partnerTierNumber) return null;

  const childCount = await tx.partner.count({
    where: {
      parentId,
      partnerTierNumber: { not: null },
    },
  });

  return `${parent.partnerTierNumber}-${childCount + 1}`;
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
 * 親が 'N次代理店' → '(N+1)次代理店'
 */
export async function calculateTierFromParent(
  tx: TxClient,
  parentId: number | null,
): Promise<string> {
  if (!parentId) return '1次代理店';

  const parent = await tx.partner.findUnique({
    where: { id: parentId },
    select: { partnerTier: true },
  });
  if (!parent?.partnerTier) return '1次代理店';

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
