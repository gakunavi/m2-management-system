/**
 * フロント側フィルター値のシリアライズ/デシリアライズ
 *
 * 全フィルター値は string として管理される。
 * multi-select → カンマ区切り、range → チルダ区切り。
 */

/** multi-select / checkbox-group: string[] → "1,2,3" */
export function serializeMultiValue(values: string[]): string {
  return values.filter(Boolean).join(',');
}

/** multi-select / checkbox-group: "1,2,3" → string[] */
export function deserializeMultiValue(value: string): string[] {
  return value ? value.split(',').filter(Boolean) : [];
}

/** range (date-range / number-range): (from, to) → "from~to" */
export function serializeRange(from: string, to: string): string {
  if (!from && !to) return '';
  return `${from}~${to}`;
}

/** range: "from~to" → { from, to } */
export function deserializeRange(value: string): { from: string; to: string } {
  if (!value || !value.includes('~')) return { from: '', to: '' };
  const [from = '', to = ''] = value.split('~', 2);
  return { from, to };
}
