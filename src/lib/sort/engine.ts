// ============================================
// 統一ソート基盤 — エンジン
// ============================================
// resolveSort: SortItem[] + SortSpec → { prismaOrderBy, appSortItems, needsAppSort }
// applyAppSort: フォーマット済み行配列を全キーで多段ソート（合成可能）
//
// 設計方針:
// - DB で確定できる列(db/relation)のみのソートは prismaOrderBy で処理しページング維持。
// - select/natural/status/customData が1つでも含まれる場合は needsAppSort=true。
//   呼び出し側は全件取得 → applyAppSort で全キーを多段ソート → スライス。
//   これにより「ステータス＋他列」「カスタム＋他列」も正しく合成される。

import type { SortItem, SortSpec, AppSortContext } from './types';
import { isAppSortKind } from './types';
import { compareValues, compareByOptionOrder } from '@/lib/sort-helper';

const CUSTOM_DATA_PREFIXES = [
  'customData_',
  'customerLink_',
  'customerGlobal_',
  'partnerLink_',
  'partnerGlobal_',
] as const;

function stripCustomDataPrefix(field: string): string {
  for (const p of CUSTOM_DATA_PREFIXES) {
    if (field.startsWith(p)) return field.slice(p.length);
  }
  return field;
}

function isCustomDataField(field: string): boolean {
  return CUSTOM_DATA_PREFIXES.some((p) => field.startsWith(p));
}

/**
 * 動的カスタム列(customData_/customerLink_/partnerLink_ 等)を spec に補完する。
 * これらは実行時にしか分からないため、ソート項目に含まれる分だけ customData 戦略で付与。
 */
export function withCustomDataFields(spec: SortSpec, sortItems: SortItem[]): SortSpec {
  let merged: SortSpec | null = null;
  for (const s of sortItems) {
    if (!spec[s.field] && isCustomDataField(s.field)) {
      merged ??= { ...spec };
      merged[s.field] = { kind: 'customData' };
    }
  }
  return merged ?? spec;
}

/** リレーションパスを Prisma のネスト orderBy に変換（['customer','customerName'] → {customer:{customerName:dir}}） */
function nestedOrder(path: readonly string[], dir: 'asc' | 'desc'): Record<string, unknown> {
  let obj: Record<string, unknown> = { [path[path.length - 1]]: dir };
  for (let i = path.length - 2; i >= 0; i--) obj = { [path[i]]: obj };
  return obj;
}

export type ResolvedSort = {
  /** db/relation 列の Prisma orderBy（needsAppSort=false のとき使用） */
  prismaOrderBy: Record<string, unknown>[];
  /** spec に存在する有効なソート項目（appSort 時の全キー） */
  appSortItems: SortItem[];
  /** アプリ側ソートが必要か（全件取得が必要） */
  needsAppSort: boolean;
};

/**
 * ソート項目を spec で検証し、DB orderBy とアプリ側ソート計画に分解する。
 * spec に無いフィールドは除外（＝ソート不可。黙って落とす）。
 */
export function resolveSort(sortItems: SortItem[], spec: SortSpec): ResolvedSort {
  const valid = sortItems.filter((s) => spec[s.field]);
  const needsAppSort = valid.some((s) => isAppSortKind(spec[s.field].kind));

  const prismaOrderBy = valid
    .filter((s) => {
      const k = spec[s.field].kind;
      return k === 'db' || k === 'relation';
    })
    .map((s) => {
      const strat = spec[s.field];
      if (strat.kind === 'relation') return nestedOrder(strat.path, s.direction);
      const column = strat.kind === 'db' ? strat.column ?? s.field : s.field;
      return { [column]: s.direction };
    });

  return { prismaOrderBy, appSortItems: valid, needsAppSort };
}

/**
 * 1フィールドの値を行から取り出す。
 * 本エンジンは「フォーマット済み行」をソートする前提のため、customData も含めて
 * 全フィールドがフラット展開済み（row[field]）。getCustomData は未展開行のフォールバック。
 */
function readFieldValue(
  row: Record<string, unknown>,
  field: string,
  ctx: AppSortContext,
): unknown {
  if (row[field] !== undefined) return row[field] ?? null;
  if (ctx.getCustomData && field.startsWith('customData_')) {
    const origKey = field.slice('customData_'.length);
    return ctx.getCustomData(row)?.[origKey] ?? null;
  }
  return null;
}

/**
 * フォーマット済み行配列を sortItems の全キーで多段ソートする（新しい配列を返す）。
 * 戦略ごとに正しい比較を行い、合成する。
 */
export function applyAppSort<T extends Record<string, unknown>>(
  rows: T[],
  sortItems: SortItem[],
  spec: SortSpec,
  ctx: AppSortContext = {},
): T[] {
  const valid = sortItems.filter((s) => spec[s.field]);

  // select 戦略の order を value→index Map に事前変換
  const selectMaps = new Map<string, Map<string, number>>();
  for (const item of valid) {
    const strat = spec[item.field];
    if (strat.kind === 'select') {
      selectMaps.set(item.field, new Map(strat.order.map((v, i) => [v, i])));
    }
  }

  return [...rows].sort((a, b) => {
    for (const item of valid) {
      const strat = spec[item.field];
      let cmp = 0;

      if (strat.kind === 'select') {
        cmp = compareByOptionOrder(a[item.field], b[item.field], selectMaps.get(item.field)!);
      } else if (strat.kind === 'status') {
        const ao = ctx.statusOrder?.get(`${a.businessId}:${a[item.field]}`) ?? 9999;
        const bo = ctx.statusOrder?.get(`${b.businessId}:${b[item.field]}`) ?? 9999;
        cmp = ao - bo;
      } else if (strat.kind === 'customData') {
        const av = readFieldValue(a, item.field, ctx);
        const bv = readFieldValue(b, item.field, ctx);
        const optOrder = ctx.customSelectOrder?.get(stripCustomDataPrefix(item.field));
        cmp = optOrder ? compareByOptionOrder(av, bv, optOrder) : compareValues(av, bv);
      } else {
        // db / relation / natural はフラット値を汎用比較（自然順含む）
        cmp = compareValues(a[item.field], b[item.field]);
      }

      if (cmp !== 0) return item.direction === 'asc' ? cmp : -cmp;
    }
    return 0;
  });
}

/**
 * needsAppSort 時のページング: 全件取得のため skip/take を外す。
 */
export function appSortPagination(
  needsAppSort: boolean,
  page: number,
  pageSize: number,
): { skip: number | undefined; take: number | undefined } {
  if (needsAppSort) return { skip: undefined, take: undefined };
  return { skip: (page - 1) * pageSize, take: pageSize };
}
