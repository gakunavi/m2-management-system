/**
 * API ルート共通ソートユーティリティ（複数列ソート対応）
 *
 * 使い方:
 *   const orderBy = buildOrderBy(searchParams, CUSTOMER_SORT_FIELDS, [{ field: 'customerCode', direction: 'asc' }]);
 *   await prisma.customer.findMany({ orderBy });
 *
 * クエリパラメータ形式:
 *   ?sort=customerCode:asc,customerName:desc  ← カンマ区切りで複数列指定
 *   ?sortField=customerCode&sortDirection=asc  ← 後方互換（単一列）
 *
 * カスタムフィールドソート:
 *   customData_xxx 形式のフィールド名を使用。アプリケーション側でソートされる。
 *   例: ?sort=customData_estimatedRevenue:desc
 */

export type SortDirection = 'asc' | 'desc';
export type SortItem = { field: string; direction: SortDirection };

/** customData_ プレフィックス（案件カスタム + 顧客/代理店クロスエンティティカスタム） */
const CUSTOM_DATA_PREFIXES = ['customData_', 'customerLink_', 'customerGlobal_', 'partnerLink_', 'partnerGlobal_'] as const;

export function isCustomDataSort(field: string): boolean {
  return CUSTOM_DATA_PREFIXES.some((p) => field.startsWith(p));
}

function extractCustomDataKey(field: string): string {
  // フラット展開キーからフィールドキーを抽出（prefix を除去）
  // ソートはフラット展開済みの行データで行うため、キー全体を返す
  return field;
}

/** SortItems にカスタムフィールドソートが含まれるか判定 */
function hasCustomDataSort(sortItems: SortItem[]): boolean {
  return sortItems.some((item) => isCustomDataSort(item.field));
}

/**
 * リクエストの searchParams からソートパラメータを取得する。
 * - sort=field1:asc,field2:desc 形式（複数列）を優先
 * - sortField / sortDirection（単一列）にフォールバック
 */
export function parseSortParams(
  searchParams: URLSearchParams,
  defaultField: string,
  defaultDirection: SortDirection = 'asc',
): SortItem[] {
  // 新形式: sort=field1:asc,field2:desc
  const sortParam = searchParams.get('sort');
  if (sortParam) {
    const items = sortParam.split(',').map((s) => {
      const [field, dir] = s.split(':');
      return {
        field: field.trim(),
        direction: (dir === 'asc' || dir === 'desc' ? dir : 'asc') as SortDirection,
      };
    }).filter((item) => item.field);
    if (items.length > 0) return items;
  }

  // 後方互換: sortField / sortDirection（単一）
  const sortField = searchParams.get('sortField');
  if (sortField) {
    const rawDirection = searchParams.get('sortDirection');
    const direction: SortDirection =
      rawDirection === 'asc' || rawDirection === 'desc' ? rawDirection : defaultDirection;
    return [{ field: sortField, direction }];
  }

  return [{ field: defaultField, direction: defaultDirection }];
}

/**
 * ソートパラメータをホワイトリスト検証し、Prisma の orderBy 形式で返す。
 * allowedFields に含まれないフィールドは除外（customData_ プレフィックスも除外）。
 * 全て除外された場合は defaultSort にフォールバック。
 */
export function buildOrderBy(
  sortItems: SortItem[],
  allowedFields: readonly string[],
  defaultSort: SortItem[],
): Record<string, SortDirection>[] {
  const validated = sortItems
    .filter((item) => !isCustomDataSort(item.field) && allowedFields.includes(item.field))
    .map((item) => ({ [item.field]: item.direction }));

  if (validated.length === 0 && !hasCustomDataSort(sortItems)) {
    return defaultSort.map((item) => ({ [item.field]: item.direction }));
  }

  return validated;
}

/** select型フィールドのオプション順序マップ: fieldKey → optionValue → index */
export type SelectOptionOrderMap = Map<string, Map<string, number>>;

/**
 * カスタムフィールド（JSONB）でレコード配列をアプリケーション側でソートする。
 * sortItems のうち customData_ プレフィックスを持つフィールドのみ処理。
 * select 型フィールドはオプション定義順でソートする。
 *
 * @param records - ソート対象のレコード配列
 * @param sortItems - ソート項目
 * @param getCustomData - レコードから projectCustomData を取得する関数
 * @param selectOrderMap - select型フィールドのオプション順序マップ（省略時は文字列比較）
 * @returns ソート済み配列（新しい配列）
 */
function sortByCustomData<T>(
  records: T[],
  sortItems: SortItem[],
  getCustomData: (record: T) => Record<string, unknown> | null,
  selectOrderMap?: SelectOptionOrderMap,
): T[] {
  const customSortItems = sortItems.filter((item) => isCustomDataSort(item.field));
  if (customSortItems.length === 0) return records;

  return [...records].sort((a, b) => {
    for (const item of customSortItems) {
      const key = extractCustomDataKey(item.field);
      // customData_ プレフィックスのみ getCustomData を使用、他はフラット展開済みの行データから直接取得
      const isProjectCustom = item.field.startsWith('customData_');
      let aVal: unknown;
      let bVal: unknown;
      if (isProjectCustom) {
        const origKey = item.field.slice('customData_'.length);
        const aData = getCustomData(a);
        const bData = getCustomData(b);
        aVal = aData?.[origKey] ?? null;
        bVal = bData?.[origKey] ?? null;
      } else {
        // customerLink_xxx, partnerLink_xxx 等 — フラット展開済みの行データから取得
        aVal = (a as Record<string, unknown>)[key] ?? null;
        bVal = (b as Record<string, unknown>)[key] ?? null;
      }

      // select型: オプション定義順で比較
      const optionOrder = selectOrderMap?.get(key);
      const cmp = optionOrder
        ? compareByOptionOrder(aVal, bVal, optionOrder)
        : compareValues(aVal, bVal);
      if (cmp !== 0) {
        return item.direction === 'asc' ? cmp : -cmp;
      }
    }
    return 0;
  });
}

/** select型フィールドをオプション定義順で比較 */
function compareByOptionOrder(
  a: unknown,
  b: unknown,
  orderMap: Map<string, number>,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const aIdx = orderMap.get(String(a)) ?? 9999;
  const bIdx = orderMap.get(String(b)) ?? 9999;
  return aIdx - bIdx;
}

/** 数値を含む文字列の自然順ソート（"MO-1","MO-2","MO-11" の順になる） */
function naturalCompare(a: string, b: string): number {
  const aParts = a.split(/(\d+)/);
  const bParts = b.split(/(\d+)/);
  const len = Math.min(aParts.length, bParts.length);

  for (let i = 0; i < len; i++) {
    const ap = aParts[i];
    const bp = bParts[i];

    if (/^\d+$/.test(ap) && /^\d+$/.test(bp)) {
      const diff = parseInt(ap, 10) - parseInt(bp, 10);
      if (diff !== 0) return diff;
    } else {
      const diff = ap.localeCompare(bp, 'ja');
      if (diff !== 0) return diff;
    }
  }
  return aParts.length - bParts.length;
}

/** null を末尾に配置する汎用比較関数 */
function compareValues(a: unknown, b: unknown): number {
  // null/undefined は末尾
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  // 数値比較
  if (typeof a === 'number' && typeof b === 'number') return a - b;

  // boolean 比較
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return a === b ? 0 : a ? -1 : 1;
  }

  // 文字列比較（自然順ソート）
  return naturalCompare(String(a), String(b));
}

/**
 * カスタムフィールドソート時に、全件取得→ソート→スライスするためのページネーションヘルパー。
 * カスタムフィールドソートが含まれる場合は skip=0, take=undefined（全件取得）を返す。
 */
export function getCustomSortPagination(
  sortItems: SortItem[],
  skip: number,
  take: number,
): { skip: number; take: number | undefined; needsAppSort: boolean } {
  if (hasCustomDataSort(sortItems)) {
    return { skip: 0, take: undefined, needsAppSort: true };
  }
  return { skip, take, needsAppSort: false };
}

/**
 * アプリケーション側ソート後にページネーションスライスを適用する。
 */
export function applyAppSortAndSlice<T>(
  records: T[],
  sortItems: SortItem[],
  getCustomData: (record: T) => Record<string, unknown> | null,
  skip: number,
  take: number,
  selectOrderMap?: SelectOptionOrderMap,
): T[] {
  const sorted = sortByCustomData(records, sortItems, getCustomData, selectOrderMap);
  return sorted.slice(skip, skip + take);
}

/**
 * ProjectFieldDefinition[] から select 型のオプション順序マップを構築する。
 */
export function buildSelectOptionOrderMap(
  fields: { key: string; type: string; options?: string[] }[],
): SelectOptionOrderMap {
  const map: SelectOptionOrderMap = new Map();
  for (const f of fields) {
    if (f.type === 'select' && f.options && f.options.length > 0) {
      const orderMap = new Map<string, number>();
      f.options.forEach((opt, idx) => orderMap.set(opt, idx));
      map.set(f.key, orderMap);
    }
  }
  return map;
}

// ============================================
// 各エンティティのソート許可フィールド定義
// ============================================

export const CUSTOMER_SORT_FIELDS = [
  'customerCode',
  'customerName',
  'customerSalutation',
  'customerType',
  'customerPostalCode',
  'customerAddress',
  'customerPhone',
  'customerFax',
  'customerEmail',
  'customerWebsite',
  'customerCorporateNumber',
  'customerInvoiceNumber',
  'customerCapital',
  'customerEstablishedDate',
  'customerFolderUrl',
  'customerNotes',
  'customerIsActive',
  'updatedAt',
  'createdAt',
] as const;

export const BUSINESS_SORT_FIELDS = [
  'businessCode',
  'businessName',
  'businessSortOrder',
  'businessIsActive',
  'updatedAt',
  'createdAt',
] as const;

export const TASK_SORT_FIELDS = [
  'taskNo',
  'title',
  'status',
  'priority',
  'dueDate',
  'scope',
  'sortOrder',
  'completedAt',
  'updatedAt',
  'createdAt',
] as const;

export const PARTNER_SORT_FIELDS = [
  'partnerCode',
  'partnerTier',
  'partnerTierNumber',
  'partnerName',
  'partnerSalutation',
  'partnerType',
  'partnerPostalCode',
  'partnerAddress',
  'partnerPhone',
  'partnerFax',
  'partnerEmail',
  'partnerWebsite',
  'partnerEstablishedDate',
  'partnerCorporateNumber',
  'partnerInvoiceNumber',
  'partnerCapital',
  'partnerFolderUrl',
  'partnerNotes',
  'partnerIsActive',
  'updatedAt',
  'createdAt',
] as const;
