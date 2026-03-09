export const CHART_COLORS = {
  primary: '#3b82f6',
  secondary: '#9ca3af',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
} as const;

export const CHART_DEFAULTS = {
  barSize: 32,
  lineStrokeWidth: 2,
} as const;

/**
 * 金額を短縮表示する
 */
export function formatCurrency(amount: number, short = false): string {
  if (!short) {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      maximumFractionDigits: 0,
    }).format(amount);
  }

  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  if (abs >= 100_000_000) {
    return `${sign}¥${(abs / 100_000_000).toFixed(1)}億`;
  }
  if (abs >= 10_000) {
    return `${sign}¥${Math.round(abs / 10_000).toLocaleString()}万`;
  }
  return `${sign}¥${abs.toLocaleString()}`;
}

/**
 * Y軸用金額フォーマッタ
 */
export function formatYAxis(value: number): string {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(0)}億`;
  if (value >= 10_000) return `${Math.round(value / 10_000)}万`;
  return String(value);
}

/**
 * KPI ユニットフォーマットパターンで数値を表示する
 * パターン例: `¥#` → `¥1,000` / `#円` → `1,000円` / `#台` → `1,000台`
 * `#` がない場合は後方互換: `円` → `1,000円` のように末尾に付与
 * short=true で万・億に短縮
 */
export function formatKpiValue(value: number, unit?: string | null, short = false): string {
  if (!unit) return formatCurrency(value, short);

  const hasPlaceholder = unit.includes('#');
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  // 短縮表示: 万・億
  let numStr: string;
  let suffix = '';
  if (short && abs >= 100_000_000) {
    numStr = (abs / 100_000_000).toFixed(1);
    suffix = '億';
  } else if (short && abs >= 10_000) {
    numStr = Math.round(abs / 10_000).toLocaleString();
    suffix = '万';
  } else {
    numStr = abs.toLocaleString();
  }

  const formatted = `${sign}${numStr}${suffix}`;

  if (hasPlaceholder) {
    return unit.replace('#', formatted);
  }

  // 後方互換: `#` なしの場合はパターン推定
  // `¥` や `$` で始まるならプレフィックス扱い
  if (/^[¥$€£]/.test(unit)) {
    return `${unit}${formatted}`;
  }
  // それ以外はサフィックス
  return `${formatted}${unit}`;
}

/**
 * Y軸用 KPI ユニットフォーマッタ
 */
export function formatKpiYAxis(value: number, unit?: string | null): string {
  if (!unit) return formatYAxis(value);

  const hasPlaceholder = unit.includes('#');
  let numStr: string;
  if (value >= 100_000_000) {
    numStr = `${(value / 100_000_000).toFixed(0)}億`;
  } else if (value >= 10_000) {
    numStr = `${Math.round(value / 10_000)}万`;
  } else {
    numStr = String(value);
  }

  if (hasPlaceholder) {
    return unit.replace('#', numStr);
  }

  if (/^[¥$€£]/.test(unit)) {
    return `${unit}${numStr}`;
  }
  return `${numStr}${unit}`;
}
