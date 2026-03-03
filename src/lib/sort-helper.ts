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

/** customData_ プレフィックス */
const CUSTOM_DATA_PREFIX = 'customData_';

export function isCustomDataSort(field: string): boolean {
  return field.startsWith(CUSTOM_DATA_PREFIX);
}

function extractCustomDataKey(field: string): string {
  return field.slice(CUSTOM_DATA_PREFIX.length);
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

/**
 * カスタムフィールド（JSONB）でレコード配列をアプリケーション側でソートする。
 * sortItems のうち customData_ プレフィックスを持つフィールドのみ処理。
 *
 * @param records - ソート対象のレコード配列
 * @param sortItems - ソート項目
 * @param getCustomData - レコードから projectCustomData を取得する関数
 * @returns ソート済み配列（新しい配列）
 */
function sortByCustomData<T>(
  records: T[],
  sortItems: SortItem[],
  getCustomData: (record: T) => Record<string, unknown> | null,
): T[] {
  const customSortItems = sortItems.filter((item) => isCustomDataSort(item.field));
  if (customSortItems.length === 0) return records;

  return [...records].sort((a, b) => {
    for (const item of customSortItems) {
      const key = extractCustomDataKey(item.field);
      const aData = getCustomData(a);
      const bData = getCustomData(b);
      const aVal = aData?.[key] ?? null;
      const bVal = bData?.[key] ?? null;

      const cmp = compareValues(aVal, bVal);
      if (cmp !== 0) {
        return item.direction === 'asc' ? cmp : -cmp;
      }
    }
    return 0;
  });
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

  // 文字列比較
  return String(a).localeCompare(String(b), 'ja');
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
): T[] {
  const sorted = sortByCustomData(records, sortItems, getCustomData);
  return sorted.slice(skip, skip + take);
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
