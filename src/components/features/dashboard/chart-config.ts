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
