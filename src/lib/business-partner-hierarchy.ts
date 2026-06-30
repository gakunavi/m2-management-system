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
 * - 1次代理店（businessParentId = null）: 代理店コード（例: "AG-0001"）
 * - 2次代理店（businessParentId → 1次）: 親のtierNumber + "-1", "-2"…
 * - 3次代理店（businessParentId → 2次）: 親のtierNumber + "-1-1", "-1-2"…
 *
 * 兄弟の連番は既存MAXから+1（削除後も重複しない）
 */
export async function generateBusinessTierNumber(
  tx: TxClient,
  businessId: number,
  businessTier: string | null,
  businessParentId: number | null,
  partnerCode: string,
): Promise<string | null> {
  if (!businessTier) return null;

  if (businessTier === '1次代理店' || !businessParentId) {
    // 1次代理店: 代理店コードそのもの
    return partnerCode;
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

  // 既存の兄弟から連番の最大値を取得
  const siblings = await tx.partnerBusinessLink.findMany({
    where: {
      businessId,
      businessParentId,
      businessTierNumber: { not: null, startsWith: `${parentLink.businessTierNumber}-` },
    },
    select: { businessTierNumber: true },
  });

  let maxSeq = 0;
  const prefix = `${parentLink.businessTierNumber}-`;
  for (const s of siblings) {
    if (!s.businessTierNumber) continue;
    const suffix = s.businessTierNumber.slice(prefix.length);
    // 直接の子の連番のみ
    if (!suffix.includes('-')) {
      const num = parseInt(suffix, 10);
      if (!isNaN(num) && num > maxSeq) maxSeq = num;
    }
  }

  return `${parentLink.businessTierNumber}-${maxSeq + 1}`;
}

/**
 * 事業別の階層ラベルと親代理店の整合性を検証する（N次対応）
 * - 1次代理店 → businessParentId は null であるべき
 * - N次代理店 → 親は同事業内で (N-1)次代理店
 */
export async function validateBusinessTierHierarchy(
  tx: TxClient,
  businessId: number,
  businessTier: string | null,
  businessParentId: number | null,
): Promise<string | null> {
  if (!businessTier) return null;

  const match = businessTier.match(/^(\d+)次代理店$/);
  if (!match) return `不正な階層ラベルです: ${businessTier}`;
  const depth = parseInt(match[1], 10);

  if (depth === 1) {
    if (businessParentId) return '1次代理店は親代理店を設定できません';
    return null;
  }

  // N次(N>=2)は親が必須
  const expectedParentTier = `${depth - 1}次代理店`;
  if (!businessParentId) return `${businessTier}は親代理店（${expectedParentTier}）の選択が必須です`;

  const parentLink = await tx.partnerBusinessLink.findFirst({
    where: { businessId, partnerId: businessParentId },
    select: { businessTier: true },
  });
  if (!parentLink) return '指定された親代理店はこの事業にリンクされていません';
  if (parentLink.businessTier !== expectedParentTier) {
    return `${businessTier}の親はこの事業で${expectedParentTier}である必要があります`;
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
    select: { businessTier: true, businessTierNumber: true },
  });
  if (!parentLink) return;

  // 親の階層深さを取得（N次対応: 子は N+1 次）
  const parentDepth = parentLink.businessTier
    ? parseInt(parentLink.businessTier.match(/^(\d+)/)?.[1] ?? '0', 10)
    : null;
  const childTierLabel = parentDepth ? `${parentDepth + 1}次代理店` : null;

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
      data: {
        businessTierNumber: childTierNumber,
        ...(childTierLabel ? { businessTier: childTierLabel } : {}),
      },
    });

    // 再帰的に孫も更新
    await recalculateBusinessDescendantTierNumbers(tx, businessId, children[i].partnerId);
  }
}

/**
 * 指定事業の全代理店の事業別階層番号を再計算する（マイグレーション用）
 * 1次 → 代理店コード、N次 → 親のtierNumber + 連番
 */
export async function recalculateAllBusinessTierNumbers(
  tx: TxClient,
  businessId: number,
): Promise<void> {
  // 1次代理店を全て更新: tierNumber = partnerCode
  const roots = await tx.partnerBusinessLink.findMany({
    where: { businessId, businessTier: '1次代理店' },
    orderBy: { id: 'asc' },
    include: { partner: { select: { partnerCode: true } } },
  });

  for (const root of roots) {
    await tx.partnerBusinessLink.update({
      where: { id: root.id },
      data: { businessTierNumber: root.partner.partnerCode },
    });

    // 子孫を再帰的に再計算
    await recalculateBusinessDescendantTierNumbers(tx, businessId, root.partnerId);
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

/**
 * 同一事業内で、子リンクをグローバル親の配下に接続する（内部ヘルパー）。
 *
 * - 子リンクが存在しない／既に事業別階層が設定済み → 何もしない（手動設定を尊重）
 * - 親リンクが存在しない → 何もしない（親が同事業に未リンク）
 * - 親が事業別階層未設定 → 親を1次代理店に自動昇格（PATCH時の挙動と同一）
 * - 接続後は孫もカスケード再計算
 */
async function connectChildToParentInBusiness(
  tx: TxClient,
  businessId: number,
  childPartnerId: number,
  parentPartnerId: number,
): Promise<void> {
  const childLink = await tx.partnerBusinessLink.findFirst({
    where: { businessId, partnerId: childPartnerId, linkStatus: 'active' },
    select: { id: true, businessTier: true },
  });
  if (!childLink) return; // 子が同事業に未リンク
  if (childLink.businessTier) return; // 既に階層設定済み → 触らない

  const parentLink = await tx.partnerBusinessLink.findFirst({
    where: { businessId, partnerId: parentPartnerId, linkStatus: 'active' },
    include: { partner: { select: { partnerCode: true } } },
  });
  if (!parentLink) return; // 親が同事業に未リンク

  // 親が事業別階層未設定 → 1次代理店に自動昇格
  let parentTier = parentLink.businessTier;
  if (!parentTier) {
    const parentTierNumber = await generateBusinessTierNumber(
      tx, businessId, '1次代理店', null, parentLink.partner.partnerCode,
    );
    await tx.partnerBusinessLink.update({
      where: { id: parentLink.id },
      data: { businessTier: '1次代理店', businessTierNumber: parentTierNumber, businessParentId: null },
    });
    parentTier = '1次代理店';
  }

  const match = parentTier.match(/^(\d+)次代理店$/);
  if (!match) return;
  const childTier = `${parseInt(match[1], 10) + 1}次代理店`;

  const childPartner = await tx.partner.findUnique({
    where: { id: childPartnerId },
    select: { partnerCode: true },
  });
  if (!childPartner) return;

  const childTierNumber = await generateBusinessTierNumber(
    tx, businessId, childTier, parentPartnerId, childPartner.partnerCode,
  );

  await tx.partnerBusinessLink.update({
    where: { id: childLink.id },
    data: {
      businessParentId: parentPartnerId,
      businessTier: childTier,
      businessTierNumber: childTierNumber,
    },
  });

  // 既に子の配下に孫がいれば番号をカスケード再計算
  await recalculateBusinessDescendantTierNumbers(tx, businessId, childPartnerId);
}

/**
 * 事業リンク作成時に、グローバルな親子関係（partners.parent_id）から事業別階層を
 * 「双方向」で継承する。登録順に依存しないことが目的。
 *
 * 1. 自分 → グローバル親の配下へ接続（親が同事業にリンク済みの場合）
 * 2. 自分の配下 → 既に同事業にリンク済みのグローバル子を自分の配下へ接続
 *
 * これにより「親より先に子を登録」「子より後に親を登録」のどちらの順でも
 * 最終的に正しい事業別階層に揃う。手動で階層設定済みのリンクは上書きしない。
 *
 * 対象リンクは事前に作成済みであること（同一トランザクション内で呼ぶ）。
 */
export async function inheritBusinessHierarchyOnLink(
  tx: TxClient,
  partnerId: number,
  businessId: number,
): Promise<void> {
  const partner = await tx.partner.findUnique({
    where: { id: partnerId },
    select: { parentId: true },
  });

  // 1. 自分をグローバル親の配下へ接続
  if (partner?.parentId) {
    await connectChildToParentInBusiness(tx, businessId, partnerId, partner.parentId);
  }

  // 2. 同事業に既にリンク済みのグローバル子を、自分の配下へ接続
  const globalChildren = await tx.partner.findMany({
    where: { parentId: partnerId },
    select: { id: true },
  });
  for (const child of globalChildren) {
    await connectChildToParentInBusiness(tx, businessId, child.id, partnerId);
  }
}
