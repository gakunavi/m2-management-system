// ============================================
// 事業別代理店階層管理ユーティリティ
// partner-hierarchy.ts のパターンを踏襲し
// PartnerBusinessLink テーブルにスコープ
// ============================================

import type { PrismaClient } from '@prisma/client';

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/**
 * 事業別階層番号（businessTierNumber）を生成する
 *
 * - 1次代理店（businessParentId = null）: "1", "2", "3"…
 * - 2次代理店（businessParentId → 1次）: "1-1", "1-2"…
 * - 3次代理店（businessParentId → 2次）: "1-1-1", "1-1-2"…
 */
export async function generateBusinessTierNumber(
  tx: TxClient,
  businessId: number,
  businessTier: string | null,
  businessParentId: number | null,
): Promise<string | null> {
  if (!businessTier) return null;

  if (businessTier === '1次代理店' || !businessParentId) {
    // 1次代理店: 同一事業内のルートレベル連番
    const siblings = await tx.partnerBusinessLink.count({
      where: {
        businessId,
        businessTier: '1次代理店',
        businessParentId: null,
        businessTierNumber: { not: null },
      },
    });
    return String(siblings + 1);
  }

  // 2次・3次: 親の事業別 tierNumber を取得して子連番を付与
  const parentLink = await tx.partnerBusinessLink.findFirst({
    where: {
      businessId,
      partnerId: businessParentId,
    },
    select: { businessTierNumber: true },
  });
  if (!parentLink?.businessTierNumber) return null;

  const childCount = await tx.partnerBusinessLink.count({
    where: {
      businessId,
      businessParentId,
      businessTierNumber: { not: null },
    },
  });

  return `${parentLink.businessTierNumber}-${childCount + 1}`;
}

/**
 * 事業別の階層ラベルと親代理店の整合性を検証する
 * - 1次代理店 → businessParentId は null であるべき
 * - 2次代理店 → 親は同事業内で businessTier = '1次代理店'
 * - 3次代理店 → 親は同事業内で businessTier = '2次代理店'
 */
export async function validateBusinessTierHierarchy(
  tx: TxClient,
  businessId: number,
  businessTier: string | null,
  businessParentId: number | null,
): Promise<string | null> {
  if (!businessTier) return null;

  if (businessTier === '1次代理店') {
    if (businessParentId) return '1次代理店は親代理店を設定できません';
    return null;
  }

  if (businessTier === '2次代理店') {
    if (!businessParentId) return '2次代理店は親代理店（1次代理店）の選択が必須です';
    const parentLink = await tx.partnerBusinessLink.findFirst({
      where: { businessId, partnerId: businessParentId },
      select: { businessTier: true },
    });
    if (!parentLink) return '指定された親代理店はこの事業にリンクされていません';
    if (parentLink.businessTier !== '1次代理店') return '2次代理店の親はこの事業で1次代理店である必要があります';
    return null;
  }

  if (businessTier === '3次代理店') {
    if (!businessParentId) return '3次代理店は親代理店（2次代理店）の選択が必須です';
    const parentLink = await tx.partnerBusinessLink.findFirst({
      where: { businessId, partnerId: businessParentId },
      select: { businessTier: true },
    });
    if (!parentLink) return '指定された親代理店はこの事業にリンクされていません';
    if (parentLink.businessTier !== '2次代理店') return '3次代理店の親はこの事業で2次代理店である必要があります';
    return null;
  }

  return null;
}

/**
 * 事業内の循環参照チェック
 * newParentId が partnerId の子孫でないことを検証する
 */
export async function detectBusinessCircularReference(
  tx: TxClient,
  businessId: number,
  partnerId: number,
  newParentId: number | null,
): Promise<boolean> {
  if (!newParentId) return false;
  if (newParentId === partnerId) return true;

  let currentPartnerId = newParentId;

  for (let depth = 0; depth < 10; depth++) {
    const link = await tx.partnerBusinessLink.findFirst({
      where: { businessId, partnerId: currentPartnerId },
      select: { businessParentId: true },
    });
    if (!link || !link.businessParentId) return false;
    if (link.businessParentId === partnerId) return true;
    currentPartnerId = link.businessParentId;
  }

  return false;
}

/**
 * 指定代理店の事業内の全子孫の businessTierNumber を再計算する
 */
export async function recalculateBusinessDescendantTierNumbers(
  tx: TxClient,
  businessId: number,
  partnerId: number,
): Promise<void> {
  const parentLink = await tx.partnerBusinessLink.findFirst({
    where: { businessId, partnerId },
    select: { businessTierNumber: true },
  });
  if (!parentLink) return;

  const children = await tx.partnerBusinessLink.findMany({
    where: { businessId, businessParentId: partnerId },
    orderBy: { id: 'asc' },
    select: { id: true, partnerId: true },
  });

  for (let i = 0; i < children.length; i++) {
    const childTierNumber = parentLink.businessTierNumber
      ? `${parentLink.businessTierNumber}-${i + 1}`
      : null;

    await tx.partnerBusinessLink.update({
      where: { id: children[i].id },
      data: { businessTierNumber: childTierNumber },
    });

    // 再帰的に孫も更新
    await recalculateBusinessDescendantTierNumbers(tx, businessId, children[i].partnerId);
  }
}

/**
 * リンク削除時に事業内の子孫の親参照をクリアする
 */
export async function clearBusinessHierarchyDescendants(
  tx: TxClient,
  businessId: number,
  partnerId: number,
): Promise<void> {
  // 直接の子を取得
  const children = await tx.partnerBusinessLink.findMany({
    where: { businessId, businessParentId: partnerId },
    select: { id: true, partnerId: true },
  });

  for (const child of children) {
    // 再帰的に孫も処理
    await clearBusinessHierarchyDescendants(tx, businessId, child.partnerId);

    // 子の階層情報をクリア
    await tx.partnerBusinessLink.update({
      where: { id: child.id },
      data: {
        businessParentId: null,
        businessTier: null,
        businessTierNumber: null,
      },
    });
  }
}

/**
 * 事業内のルート祖先の partnerId を取得する（グループツリー用）
 */
export async function findBusinessRootPartnerId(
  tx: TxClient,
  businessId: number,
  partnerId: number,
): Promise<number> {
  let currentId = partnerId;

  for (let depth = 0; depth < 10; depth++) {
    const link = await tx.partnerBusinessLink.findFirst({
      where: { businessId, partnerId: currentId, linkStatus: 'active' },
      select: { businessParentId: true },
    });
    if (!link || !link.businessParentId) return currentId;
    currentId = link.businessParentId;
  }

  return currentId;
}
