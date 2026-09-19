import { describe, it, expect } from 'vitest';
import { buildDefaultStatusCodes } from '@/lib/status-defaults';

const DEFS = [
  { statusCode: 'lead', statusIsActive: true, statusIsFinal: false, statusIsLost: false },
  { statusCode: 'proposal', statusIsActive: true, statusIsFinal: false, statusIsLost: false },
  { statusCode: 'won', statusIsActive: true, statusIsFinal: true, statusIsLost: false },
  { statusCode: 'lost', statusIsActive: true, statusIsFinal: true, statusIsLost: true },
  { statusCode: 'retired', statusIsActive: false, statusIsFinal: false, statusIsLost: false },
];

describe('buildDefaultStatusCodes', () => {
  it('既定は失注のみ除外（受注済みは残す）', () => {
    // 契約マスタ一覧の既定。最終まで除外すると受注済み契約が初期表示から消える
    expect(buildDefaultStatusCodes(DEFS)).toEqual(['lead', 'proposal', 'won']);
  });

  it('excludeFinal で最終ステータスも除外（案件ムーブメント）', () => {
    expect(buildDefaultStatusCodes(DEFS, { excludeFinal: true })).toEqual(['lead', 'proposal']);
  });

  it('excludeInactive: false で無効化済みステータスも残す', () => {
    // 契約マスタでは、無効化されたステータスが付いたままの案件を初期表示から落とさない
    expect(buildDefaultStatusCodes(DEFS, { excludeInactive: false })).toEqual([
      'lead',
      'proposal',
      'won',
      'retired',
    ]);
  });

  it('statusIsActive 未指定は有効扱い（API の meta 由来の定義を受け付ける）', () => {
    expect(buildDefaultStatusCodes([{ statusCode: 'a' }, { statusCode: 'b', statusIsLost: true }])).toEqual(['a']);
  });

  it('定義が空なら空配列', () => {
    expect(buildDefaultStatusCodes([])).toEqual([]);
  });
});
