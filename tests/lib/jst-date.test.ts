import { describe, it, expect } from 'vitest';
import { isoToJstDateInput, jstDateInputToIso } from '@/lib/jst-date';
import { toJstMonthDay } from '@/lib/reward-helpers';

describe('isoToJstDateInput', () => {
  it('日中(UTCとJST同日)はそのままの暦日', () => {
    expect(isoToJstDateInput('2026-07-18T06:00:00.000Z')).toBe('2026-07-18');
  });
  it('JST早朝帯の月境界: UTC前日23時 → JST翌日(月も繰り上がる)', () => {
    // JST 2026-07-01 08:00 = UTC 2026-06-30 23:00 → JST暦日は 07-01
    expect(isoToJstDateInput('2026-06-30T23:00:00.000Z')).toBe('2026-07-01');
  });
  it('JST 0時ちょうど(UTC前日15時)', () => {
    expect(isoToJstDateInput('2026-06-30T15:00:00.000Z')).toBe('2026-07-01');
  });
  it('null / 空 / 不正値は空文字', () => {
    expect(isoToJstDateInput(null)).toBe('');
    expect(isoToJstDateInput('')).toBe('');
    expect(isoToJstDateInput(undefined)).toBe('');
    expect(isoToJstDateInput('not-a-date')).toBe('');
  });
});

describe('jstDateInputToIso', () => {
  it('JST暦日 → その日のJST0時に相当するUTC', () => {
    // 2026-07-01 の JST 0時 = UTC 2026-06-30 15:00
    expect(jstDateInputToIso('2026-07-01')).toBe('2026-06-30T15:00:00.000Z');
  });
  it('null / 空 / 不正値は null', () => {
    expect(jstDateInputToIso(null)).toBeNull();
    expect(jstDateInputToIso('')).toBeNull();
    expect(jstDateInputToIso(undefined)).toBeNull();
    expect(jstDateInputToIso('not-a-date')).toBeNull();
  });
});

describe('round-trip: 計算エンジン(toJstMonthDay)と整合する', () => {
  it('保存→再表示で暦日が保たれる', () => {
    const iso = jstDateInputToIso('2026-07-01')!;
    expect(isoToJstDateInput(iso)).toBe('2026-07-01');
    // 計算エンジンの月・日判定も一致
    expect(toJstMonthDay(new Date(iso))).toEqual({ month: '2026-07', day: 1 });
  });

  it('自動ラッチのタイムスタンプを表示→保存しても計上月がズレない（回帰防止）', () => {
    // JST 2026-07-01 08:00 に確定した実タイムスタンプ
    const stored = '2026-06-30T23:00:00.000Z';
    // タブが表示する暦日
    const displayed = isoToJstDateInput(stored);
    expect(displayed).toBe('2026-07-01');
    // 保存で再送される値（別フィールド編集時に revenueConfirmedAt が round-trip される）
    const resent = jstDateInputToIso(displayed)!;
    // 上書き後も JST の月・日が保存前と一致（6月へ後退しない）
    expect(toJstMonthDay(new Date(resent))).toEqual(toJstMonthDay(new Date(stored)));
    expect(toJstMonthDay(new Date(resent))).toEqual({ month: '2026-07', day: 1 });
  });
});
