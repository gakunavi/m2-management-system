import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * snake_case のオブジェクトキーを camelCase に変換（再帰的）
 * Date型、null、プリミティブ値はそのまま返す
 */
export function toCamelCase<T>(obj: unknown): T {
  if (obj === null || obj === undefined) return obj as T;
  if (obj instanceof Date) return obj as T;
  if (typeof obj !== 'object') return obj as T;

  if (Array.isArray(obj)) {
    return obj.map((item) => toCamelCase(item)) as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = toCamelCase(value);
  }
  return result as T;
}

/**
 * camelCase のオブジェクトキーを snake_case に変換（再帰的）
 */
export function toSnakeCase<T>(obj: unknown): T {
  if (obj === null || obj === undefined) return obj as T;
  if (obj instanceof Date) return obj as T;
  if (typeof obj !== 'object') return obj as T;

  if (Array.isArray(obj)) {
    return obj.map((item) => toSnakeCase(item)) as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    result[snakeKey] = toSnakeCase(value);
  }
  return result as T;
}

/** 通貨フォーマット（日本円） */
export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-';
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(value);
}

/** 日付フォーマット（yyyy/MM/dd） */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}
