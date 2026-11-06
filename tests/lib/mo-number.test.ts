import { describe, it, expect } from 'vitest';
import {
  buildMoNoChange,
  moNoChangePatch,
  normalizeMoNo,
  readMoNo,
  readMoNoHistory,
  MO_NO_HISTORY_KEY,
  MO_NO_KEY,
} from '@/lib/mo-number';

// ============================================================================
// MO番号の履歴（src/lib/mo-number.ts の純粋な部分）
//
// ここが崩れると、MO番号を変えた顧客が取り込みAPIから見えなくなり、
// 同じ顧客がもう1件できる。
// ============================================================================

describe('readMoNo / readMoNoHistory', () => {
  it('未設定・空文字・空白だけは null', () => {
    expect(readMoNo({})).toBeNull();
    expect(readMoNo({ mo_no: '' })).toBeNull();
    expect(readMoNo({ mo_no: '   ' })).toBeNull();
    expect(readMoNo(null)).toBeNull();
    expect(readMoNo('壊れた値')).toBeNull();
  });

  it('前後の空白を落として読む', () => {
    expect(readMoNo({ mo_no: ' MO-1 ' })).toBe('MO-1');
  });

  it('履歴は古い順の配列。壊れた値・重複は捨てる', () => {
    expect(readMoNoHistory({})).toEqual([]);
    expect(readMoNoHistory({ mo_no_history: 'MO-1' })).toEqual([]);
    expect(
      readMoNoHistory({ mo_no_history: ['MO-1', '', null, 42, 'MO-1', ' MO-2 '] }),
    ).toEqual(['MO-1', 'MO-2']);
  });
});

describe('normalizeMoNo', () => {
  it('空文字・空白だけ・文字列以外は null', () => {
    expect(normalizeMoNo('')).toBeNull();
    expect(normalizeMoNo('  ')).toBeNull();
    expect(normalizeMoNo(null)).toBeNull();
    expect(normalizeMoNo(123)).toBeNull();
  });

  it('前後の空白を落とす', () => {
    expect(normalizeMoNo(' MO-1 ')).toBe('MO-1');
  });
});

describe('buildMoNoChange', () => {
  it('送られていなければ変更なし', () => {
    expect(buildMoNoChange({ mo_no: 'MO-1' }, undefined)).toBeNull();
  });

  it('同じ値なら変更なし（空白の違いも同じ扱い）', () => {
    expect(buildMoNoChange({ mo_no: 'MO-1' }, 'MO-1')).toBeNull();
    expect(buildMoNoChange({ mo_no: 'MO-1' }, ' MO-1 ')).toBeNull();
  });

  it('変えたら前の番号が履歴に残る', () => {
    const change = buildMoNoChange({ mo_no: 'MO-1' }, 'MO-2');
    expect(change).toEqual({ moNo: 'MO-2', history: ['MO-1'], previousMoNo: 'MO-1' });
  });

  it('何回変えても前の番号が全部残る（古い順）', () => {
    let data: Record<string, unknown> = { mo_no: 'MO-1' };
    for (const next of ['MO-2', 'MO-3', 'MO-4']) {
      const change = buildMoNoChange(data, next);
      expect(change).not.toBeNull();
      data = { ...data, ...moNoChangePatch(change!) };
    }
    expect(data[MO_NO_KEY]).toBe('MO-4');
    expect(data[MO_NO_HISTORY_KEY]).toEqual(['MO-1', 'MO-2', 'MO-3']);
  });

  it('戻した番号は履歴から外れる（今と前に同じ値を置かない）', () => {
    const change = buildMoNoChange(
      { mo_no: 'MO-2', mo_no_history: ['MO-1'] },
      'MO-1',
    );
    expect(change).toEqual({ moNo: 'MO-1', history: ['MO-2'], previousMoNo: 'MO-2' });
  });

  it('空にしても前の番号は履歴に残る（取り込みAPIが引けるように）', () => {
    const change = buildMoNoChange({ mo_no: 'MO-1' }, '');
    expect(change).toEqual({ moNo: null, history: ['MO-1'], previousMoNo: 'MO-1' });
  });

  it('未設定から入れた場合は履歴に何も足さない', () => {
    const change = buildMoNoChange({}, 'MO-1');
    expect(change).toEqual({ moNo: 'MO-1', history: [], previousMoNo: null });
  });

  it('同じ前の番号を二重に積まない', () => {
    const change = buildMoNoChange(
      { mo_no: 'MO-2', mo_no_history: ['MO-1', 'MO-2'] },
      'MO-3',
    );
    expect(change!.history).toEqual(['MO-1', 'MO-2']);
  });
});

describe('moNoChangePatch', () => {
  it('今の番号と履歴の両方を書く', () => {
    expect(moNoChangePatch({ moNo: 'MO-2', history: ['MO-1'], previousMoNo: 'MO-1' })).toEqual({
      mo_no: 'MO-2',
      mo_no_history: ['MO-1'],
    });
  });
});
