/**
 * API ルート共通: フィルターパース + Prisma where ビルダー
 *
 * 使用例:
 *   const where = {
 *     ...whereIn(sp, 'customerType'),
 *     ...whereContains(sp, 'address', 'customerAddress'),
 *     ...whereDateRange(sp, 'createdAt'),
 *     ...(whereBoolean(sp, 'isActive', 'customerIsActive') ?? { customerIsActive: true }),
 *   };
 */

/** filter[key] 形式またはフォールバック key でフィルター値を取得 */
export function getFilterParam(
  searchParams: URLSearchParams,
  key: string,
): string {
  return searchParams.get(`filter[${key}]`) || searchParams.get(key) || '';
}

/** カンマ区切り値をパース (multi-select, checkbox-group) */
export function parseMultiValue(value: string): string[] {
  return value ? value.split(',').filter(Boolean) : [];
}

/** チルダ区切り範囲値をパース (date-range, number-range) */
export function parseRange(value: string): { from: string; to: string } {
  if (!value || !value.includes('~')) return { from: '', to: '' };
  const [from = '', to = ''] = value.split('~', 2);
  return { from: from.trim(), to: to.trim() };
}

// ============================================
// Prisma where 句ビルダー
// ============================================

/** 等値フィルター (select) — 値が空なら null */
export function whereEquals(
  searchParams: URLSearchParams,
  filterKey: string,
  prismaField?: string,
): Record<string, unknown> | null {
  const value = getFilterParam(searchParams, filterKey);
  if (!value) return null;
  return { [prismaField ?? filterKey]: value };
}

/** 複数値 IN フィルター (multi-select, checkbox-group) */
export function whereIn(
  searchParams: URLSearchParams,
  filterKey: string,
  prismaField?: string,
  transform?: (v: string) => unknown,
): Record<string, unknown> | null {
  const raw = getFilterParam(searchParams, filterKey);
  const values = parseMultiValue(raw);
  if (values.length === 0) return null;
  const mapped = transform ? values.map(transform) : values;
  return { [prismaField ?? filterKey]: { in: mapped } };
}

/** テキスト部分一致 (text) */
export function whereContains(
  searchParams: URLSearchParams,
  filterKey: string,
  prismaField?: string,
): Record<string, unknown> | null {
  const value = getFilterParam(searchParams, filterKey);
  if (!value) return null;
  return {
    [prismaField ?? filterKey]: { contains: value, mode: 'insensitive' },
  };
}

/** 日付範囲フィルター (date-range) — to は「その日の終わりまで」を含む */
export function whereDateRange(
  searchParams: URLSearchParams,
  filterKey: string,
  prismaField?: string,
): Record<string, unknown> | null {
  const raw = getFilterParam(searchParams, filterKey);
  const { from, to } = parseRange(raw);
  if (!from && !to) return null;

  const conditions: Record<string, Date> = {};
  if (from) conditions.gte = new Date(from);
  if (to) {
    const toDate = new Date(to);
    toDate.setDate(toDate.getDate() + 1);
    conditions.lt = toDate;
  }
  return { [prismaField ?? filterKey]: conditions };
}

/** 数値範囲フィルター (number-range) */
export function whereNumberRange(
  searchParams: URLSearchParams,
  filterKey: string,
  prismaField?: string,
): Record<string, unknown> | null {
  const raw = getFilterParam(searchParams, filterKey);
  const { from, to } = parseRange(raw);
  if (!from && !to) return null;

  const conditions: Record<string, number> = {};
  if (from) conditions.gte = Number(from);
  if (to) conditions.lte = Number(to);
  return { [prismaField ?? filterKey]: conditions };
}

/** ブール値フィルター (boolean) — 空文字なら null (デフォルト値は呼び出し側で設定) */
export function whereBoolean(
  searchParams: URLSearchParams,
  filterKey: string,
  prismaField?: string,
): Record<string, unknown> | null {
  const value = getFilterParam(searchParams, filterKey);
  if (value === '') return null;
  return { [prismaField ?? filterKey]: value === 'true' };
}
