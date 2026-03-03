import { describe, it, expect } from 'vitest';
import { escapeCSV, parseCSVLine } from '@/lib/csv-helpers';

// ============================================
// escapeCSV
// ============================================

describe('escapeCSV', () => {
  it('通常の文字列はそのまま返す', () => {
    expect(escapeCSV('hello')).toBe('hello');
    expect(escapeCSV('株式会社サンプル')).toBe('株式会社サンプル');
  });

  it('カンマを含む場合はダブルクォートで囲む', () => {
    expect(escapeCSV('東京都,千代田区')).toBe('"東京都,千代田区"');
  });

  it('ダブルクォートを含む場合はエスケープ', () => {
    expect(escapeCSV('He said "hello"')).toBe('"He said ""hello"""');
  });

  it('改行を含む場合はダブルクォートで囲む', () => {
    expect(escapeCSV('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCSV('line1\rline2')).toBe('"line1\rline2"');
  });

  it('null/undefined は空文字', () => {
    expect(escapeCSV(null)).toBe('');
    expect(escapeCSV(undefined)).toBe('');
  });

  it('数値は文字列に変換', () => {
    expect(escapeCSV(12345)).toBe('12345');
    expect(escapeCSV(0)).toBe('0');
  });

  it('boolean は文字列に変換', () => {
    expect(escapeCSV(true)).toBe('true');
    expect(escapeCSV(false)).toBe('false');
  });

  it('カンマとダブルクォートの両方を含む場合', () => {
    expect(escapeCSV('a,"b",c')).toBe('"a,""b"",c"');
  });
});

// ============================================
// parseCSVLine
// ============================================

describe('parseCSVLine', () => {
  it('シンプルなカンマ区切り', () => {
    expect(parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('クォートされたフィールド', () => {
    expect(parseCSVLine('"hello","world"')).toEqual(['hello', 'world']);
  });

  it('クォート内のカンマ', () => {
    expect(parseCSVLine('"a,b",c')).toEqual(['a,b', 'c']);
  });

  it('エスケープされたダブルクォート', () => {
    expect(parseCSVLine('"He said ""hello""",b')).toEqual(['He said "hello"', 'b']);
  });

  it('空フィールド', () => {
    expect(parseCSVLine('a,,c')).toEqual(['a', '', 'c']);
  });

  it('末尾の空フィールド', () => {
    expect(parseCSVLine('a,b,')).toEqual(['a', 'b', '']);
  });

  it('単一フィールド', () => {
    expect(parseCSVLine('hello')).toEqual(['hello']);
  });

  it('空行', () => {
    expect(parseCSVLine('')).toEqual(['']);
  });

  it('クォート内の改行は保持される', () => {
    expect(parseCSVLine('"line1\nline2",b')).toEqual(['line1\nline2', 'b']);
  });

  it('日本語文字を含むフィールド', () => {
    expect(parseCSVLine('株式会社サンプル,東京都千代田区,03-1234-5678')).toEqual([
      '株式会社サンプル',
      '東京都千代田区',
      '03-1234-5678',
    ]);
  });

  it('クォートされた日本語フィールド', () => {
    expect(parseCSVLine('"株式会社,サンプル",東京')).toEqual(['株式会社,サンプル', '東京']);
  });

  it('escapeCSV と parseCSVLine の往復テスト', () => {
    const original = ['He said "hello"', 'a,b,c', '改行\nあり'];
    const csvLine = original.map(escapeCSV).join(',');
    const parsed = parseCSVLine(csvLine);
    expect(parsed).toEqual(original);
  });
});
