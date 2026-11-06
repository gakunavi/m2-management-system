// ============================================
// MO番号（ライト事業の顧客キー）の変更と履歴
// ============================================
//
// MO番号は顧客の事業別カスタムデータに入っている:
//   customer_business_links.link_custom_data->>'mo_no'（事業＝ライト事業）
//
// 顧客取り込みAPI（`POST /api/integrations/customers/import`）は**これをキーに顧客を
// 引く**。そのため番号を変えると、次の取り込みで同じ顧客が見つからず、もう1件
// できてしまう。これを防ぐために:
//
//   1. 変えたら前の番号を `mo_no_history` に残す（何回変えても全部残す）
//   2. 取り込み・照合・契約の絞り込みは、今の番号で見つからなければ前の番号でも探す
//   3. 変更先の番号が他の顧客の今／前の番号なら 422（同じ番号を2顧客に持たせない）
//
// 2 を忘れると 1 の履歴が意味を失い、3 を忘れると履歴がどの顧客のものか分からなく
// なる。**MO番号を読み書きする新しいコードはこのモジュールを経由すること。**
//
// ⚠️ 番号の重複チェックと書き込みは別のクエリなので、同時に同じ番号を2顧客へ割り当てる
//    競合は理屈の上では通る（DBの一意制約ではなくアプリ側のチェックであるため）。
//    MO番号の変更は人の操作であり頻度が低いので、現状は許容している。

import type { Prisma, PrismaClient } from '@prisma/client';
import { ApiError } from '@/lib/error-handler';

/** 今のMO番号のキー */
export const MO_NO_KEY = 'mo_no';
/** 前のMO番号（古い順）のキー */
export const MO_NO_HISTORY_KEY = 'mo_no_history';

/** PrismaClient / トランザクションクライアントのどちらでも使える */
export type MoNoDb = Pick<PrismaClient | Prisma.TransactionClient, 'customerBusinessLink'>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalize(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * 保存する形へそろえる。前後の空白を落とし、空文字は null（未入力）。
 * 空白混じりのまま保存すると取り込みAPIが引けなくなるため、書き込み経路は必ず通す。
 */
export function normalizeMoNo(value: unknown): string | null {
  return normalize(value);
}

/** 今のMO番号。未入力・空文字は null */
export function readMoNo(linkCustomData: unknown): string | null {
  return normalize(asRecord(linkCustomData)[MO_NO_KEY]);
}

/** 前のMO番号の一覧（古い順）。壊れた値は捨てる */
export function readMoNoHistory(linkCustomData: unknown): string[] {
  const raw = asRecord(linkCustomData)[MO_NO_HISTORY_KEY];
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const value = normalize(item);
    if (value !== null && !out.includes(value)) out.push(value);
  }
  return out;
}

// ============================================
// 検索（今の番号 → 前の番号）
// ============================================

export interface MoNoMatch {
  linkId: number;
  customerId: number;
  linkCustomData: unknown;
  /** `current` = 今の番号で一致 / `previous` = 前の番号で一致 */
  matchedBy: 'current' | 'previous';
}

/**
 * MO番号から事業リンクを1件引く。**今の番号を優先**し、無ければ前の番号で探す。
 *
 * 取り込みAPIが顧客を特定するのに使う。`previous` で一致したときは
 * **今の番号を書き換えないこと**（送信側の写しが古いだけで、変更は人が意図したもの）。
 */
export async function findLinkByMoNo(
  db: MoNoDb,
  options: { businessId: number; moNo: string },
): Promise<MoNoMatch | null> {
  const select = { id: true, customerId: true, linkCustomData: true } as const;

  const current = await db.customerBusinessLink.findFirst({
    where: {
      businessId: options.businessId,
      linkCustomData: { path: [MO_NO_KEY], equals: options.moNo },
    },
    select,
  });
  if (current) {
    return {
      linkId: current.id,
      customerId: current.customerId,
      linkCustomData: current.linkCustomData,
      matchedBy: 'current',
    };
  }

  // PostgreSQL の array_contains は配列で渡す（スカラーも通るが、公式の形に合わせる）
  const previous = await db.customerBusinessLink.findFirst({
    where: {
      businessId: options.businessId,
      linkCustomData: { path: [MO_NO_HISTORY_KEY], array_contains: [options.moNo] },
    },
    select,
  });
  if (previous) {
    return {
      linkId: previous.id,
      customerId: previous.customerId,
      linkCustomData: previous.linkCustomData,
      matchedBy: 'previous',
    };
  }

  return null;
}

/**
 * その番号を今または前に使っている顧客IDの一覧。
 *
 * 照合API・契約読み出しの絞り込み用（1件に絞らず全部返す）。
 * 正常なら最大1件だが、過去データで重複していても黙って1件に見せない。
 */
export async function findCustomerIdsByMoNo(
  db: MoNoDb,
  options: { businessId: number; moNo: string; take?: number },
): Promise<number[]> {
  const links = await db.customerBusinessLink.findMany({
    where: {
      businessId: options.businessId,
      OR: [
        { linkCustomData: { path: [MO_NO_KEY], equals: options.moNo } },
        { linkCustomData: { path: [MO_NO_HISTORY_KEY], array_contains: [options.moNo] } },
      ],
    },
    select: { customerId: true },
    ...(options.take !== undefined ? { take: options.take } : {}),
  });

  const ids: number[] = [];
  for (const link of links) {
    if (!ids.includes(link.customerId)) ids.push(link.customerId);
  }
  return ids;
}

/**
 * 変更先の番号が他の顧客に使われていないか確かめる。
 * 使われていたら 422（`ApiError.badRequest`）。
 */
export async function assertMoNoAvailable(
  db: MoNoDb,
  options: { businessId: number; moNo: string; excludeCustomerId?: number },
): Promise<void> {
  const conflict = await db.customerBusinessLink.findFirst({
    where: {
      businessId: options.businessId,
      ...(options.excludeCustomerId !== undefined
        ? { customerId: { not: options.excludeCustomerId } }
        : {}),
      OR: [
        { linkCustomData: { path: [MO_NO_KEY], equals: options.moNo } },
        { linkCustomData: { path: [MO_NO_HISTORY_KEY], array_contains: [options.moNo] } },
      ],
    },
    select: {
      linkCustomData: true,
      customer: { select: { customerCode: true } },
    },
  });
  if (!conflict) return;

  const usedAsCurrent = readMoNo(conflict.linkCustomData) === options.moNo;
  // 顧客コードまでは出す（どこを直せばよいか分からないと運用できない）。社名は出さない
  throw ApiError.badRequest('MO番号が重複しています', [
    {
      field: MO_NO_KEY,
      message:
        `MO番号「${options.moNo}」は別の顧客（${conflict.customer.customerCode}）が` +
        `${usedAsCurrent ? '使用中' : '過去に使用'}です`,
    },
  ]);
}

// ============================================
// 変更の組み立て
// ============================================

export interface MoNoChange {
  /** 新しい今の番号（null は未入力に戻す） */
  moNo: string | null;
  /** 前の番号の一覧（古い順） */
  history: string[];
  /** 変更前の番号 */
  previousMoNo: string | null;
}

/**
 * MO番号の変更を組み立てる。変更が無い（送られていない・同じ値）なら null。
 *
 * - 前の番号を履歴の末尾に足す（既にあれば足さない）
 * - 戻した番号（履歴にある番号を今の番号にした）は履歴から外す。
 *   「今の番号」と「前の番号」の両方に同じ値が居ると、どちらで一致したのか分からなくなる
 * - 空文字・空白だけは null（未入力）として扱う。前の番号は履歴に残るので、
 *   取り込みAPI は変更前の番号でも顧客を見つけられる
 */
export function buildMoNoChange(linkCustomData: unknown, requested: unknown): MoNoChange | null {
  if (requested === undefined) return null;

  const next = normalize(requested);
  const current = readMoNo(linkCustomData);
  if (next === current) return null;

  const history = readMoNoHistory(linkCustomData);
  if (current !== null && !history.includes(current)) history.push(current);

  return {
    moNo: next,
    history: next === null ? history : history.filter((v) => v !== next),
    previousMoNo: current,
  };
}

/** `linkCustomData` へマージするパッチ */
export function moNoChangePatch(change: MoNoChange): Record<string, unknown> {
  return {
    [MO_NO_KEY]: change.moNo,
    [MO_NO_HISTORY_KEY]: change.history,
  };
}

/**
 * MO番号の変更を検証して組み立てる（重複チェックつき）。
 *
 * **顧客本体を更新する前に呼ぶこと。** 422 を返すのに version を上げてしまうと、
 * 編集中のユーザーに意味のない 409 が出る。
 */
export async function resolveMoNoChange(
  db: MoNoDb,
  options: {
    businessId: number;
    customerId: number;
    linkCustomData: unknown;
    requested: unknown;
  },
): Promise<MoNoChange | null> {
  const change = buildMoNoChange(options.linkCustomData, options.requested);
  if (!change) return null;

  if (change.moNo !== null) {
    await assertMoNoAvailable(db, {
      businessId: options.businessId,
      moNo: change.moNo,
      excludeCustomerId: options.customerId,
    });
  }

  return change;
}
