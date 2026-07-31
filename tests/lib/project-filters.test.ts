import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyProjectListFilters,
  matchesCustomFieldFilters,
} from '@/lib/project-filters';

function build(query: string) {
  const where: Record<string, unknown> = {};
  const { customFieldFilters } = applyProjectListFilters(
    where,
    new URLSearchParams(query),
  );
  return { where, customFieldFilters };
}

describe('applyProjectListFilters', () => {
  it('条件なしなら where は空', () => {
    const { where, customFieldFilters } = build('');
    expect(where).toEqual({});
    expect(customFieldFilters).toEqual([]);
  });

  it('有効ステータスを真偽値に変換する', () => {
    expect(build('filter[isActive]=true').where).toEqual({ projectIsActive: true });
    expect(build('filter[isActive]=false').where).toEqual({ projectIsActive: false });
    // 旧形式（filter[] なし）も受け付ける
    expect(build('isActive=true').where).toEqual({ projectIsActive: true });
  });

  it('ポータル表示を真偽値に変換する', () => {
    expect(build('filter[portalVisible]=true').where).toEqual({ portalVisible: true });
    expect(build('filter[portalVisible]=false').where).toEqual({ portalVisible: false });
  });

  it('営業ステータスはカンマ区切りで in 条件になる', () => {
    expect(build('filter[projectSalesStatus]=won,informal_approval').where).toEqual({
      projectSalesStatus: { in: ['won', 'informal_approval'] },
    });
  });

  it('空文字のステータスは条件を作らない', () => {
    expect(build('filter[projectSalesStatus]=').where).toEqual({});
  });

  it('受注予定月のレンジ指定', () => {
    expect(
      build('filter[expectedCloseMonthFrom]=2026-04&filter[expectedCloseMonthTo]=2026-09').where,
    ).toEqual({ projectExpectedCloseMonth: { gte: '2026-04', lte: '2026-09' } });

    expect(build('filter[expectedCloseMonthFrom]=2026-04').where).toEqual({
      projectExpectedCloseMonth: { gte: '2026-04' },
    });
    expect(build('filter[expectedCloseMonthTo]=2026-09').where).toEqual({
      projectExpectedCloseMonth: { lte: '2026-09' },
    });
  });

  it('受注予定月の単月指定（レンジ未指定時のみ）', () => {
    expect(build('filter[projectExpectedCloseMonth]=2026-07').where).toEqual({
      projectExpectedCloseMonth: '2026-07',
    });
    // レンジが指定されていればレンジを優先
    expect(
      build('filter[projectExpectedCloseMonth]=2026-07&filter[expectedCloseMonthFrom]=2026-04').where,
    ).toEqual({ projectExpectedCloseMonth: { gte: '2026-04' } });
  });

  it('担当者はIDと名前の両方に対応する', () => {
    expect(build('filter[projectAssignedUserId]=12').where).toEqual({
      projectAssignedUserId: 12,
    });
    expect(build('filter[projectAssignedUserName]=田中').where).toEqual({
      projectAssignedUserName: { contains: '田中', mode: 'insensitive' },
    });
  });

  it('数値でない担当者ID・顧客IDは無視する', () => {
    expect(build('filter[projectAssignedUserId]=abc').where).toEqual({});
    expect(build('filter[customerId]=abc').where).toEqual({});
  });

  it('テキスト検索は案件番号・顧客名・代理店名・担当者名を対象にする', () => {
    const { where } = build('search=サンプル');
    expect(where.OR).toEqual([
      { projectNo: { contains: 'サンプル', mode: 'insensitive' } },
      { customer: { customerName: { contains: 'サンプル', mode: 'insensitive' } } },
      { partner: { partnerName: { contains: 'サンプル', mode: 'insensitive' } } },
      { projectAssignedUserName: { contains: 'サンプル', mode: 'insensitive' } },
    ]);
  });

  it('カスタムフィールドは where ではなく customFieldFilters に積まれる', () => {
    const { where, customFieldFilters } = build(
      'filter[customField_targetMonth]=2026-07&filter[customField_plan]=A,B',
    );
    expect(where).toEqual({});
    expect(customFieldFilters).toEqual([
      { key: 'targetMonth', values: ['2026-07'] },
      { key: 'plan', values: ['A', 'B'] },
    ]);
  });

  it('複合条件をまとめて適用できる', () => {
    const { where } = build(
      'filter[isActive]=true&filter[projectSalesStatus]=won&filter[expectedCloseMonthFrom]=2026-04&filter[portalVisible]=false',
    );
    expect(where).toEqual({
      projectIsActive: true,
      projectSalesStatus: { in: ['won'] },
      projectExpectedCloseMonth: { gte: '2026-04' },
      portalVisible: false,
    });
  });
});

describe('matchesCustomFieldFilters', () => {
  it('条件が無ければ常に true', () => {
    expect(matchesCustomFieldFilters(null, [])).toBe(true);
  });

  it('customData が無ければ false', () => {
    expect(matchesCustomFieldFilters(null, [{ key: 'a', values: ['1'] }])).toBe(false);
  });

  it('部分一致で判定する', () => {
    const data = { targetMonth: '2026-07' };
    expect(matchesCustomFieldFilters(data, [{ key: 'targetMonth', values: ['2026'] }])).toBe(true);
    expect(matchesCustomFieldFilters(data, [{ key: 'targetMonth', values: ['2025'] }])).toBe(false);
  });

  it('boolean は完全一致で判定する', () => {
    expect(matchesCustomFieldFilters({ flag: true }, [{ key: 'flag', values: ['true'] }])).toBe(true);
    expect(matchesCustomFieldFilters({ flag: true }, [{ key: 'flag', values: ['false'] }])).toBe(false);
  });

  it('複数条件は AND', () => {
    const data = { a: 'x', b: 'y' };
    expect(
      matchesCustomFieldFilters(data, [
        { key: 'a', values: ['x'] },
        { key: 'b', values: ['y'] },
      ]),
    ).toBe(true);
    expect(
      matchesCustomFieldFilters(data, [
        { key: 'a', values: ['x'] },
        { key: 'b', values: ['z'] },
      ]),
    ).toBe(false);
  });

  it('値が null のフィールドは不一致', () => {
    expect(matchesCustomFieldFilters({ a: null }, [{ key: 'a', values: ['x'] }])).toBe(false);
  });
});

// ============================================
// ドリフト検知
// ============================================
// 一覧 API と CSV エクスポート API が別々に searchParams を読み始めると、
// 「画面では絞り込めるが CSV は全件出力される」という不一致が再発する。
// 双方が共通ロジックを使い続けていることを構造的に担保する。
describe('一覧APIとCSV APIの絞り込みロジック共有', () => {
  const root = join(__dirname, '../../src/app/api/v1/projects');
  const listSource = readFileSync(join(root, 'route.ts'), 'utf-8');
  const csvSource = readFileSync(join(root, 'csv/route.ts'), 'utf-8');

  it('両方が applyProjectListFilters を使っている', () => {
    expect(listSource).toContain('applyProjectListFilters(where, searchParams)');
    expect(csvSource).toContain('applyProjectListFilters(where, searchParams)');
  });

  it('両方がカスタムフィールドのアプリ側フィルターを適用している', () => {
    expect(listSource).toContain('matchesCustomFieldFilters');
    expect(csvSource).toContain('matchesCustomFieldFilters');
  });

  it('ルート内で filter[...] を直接読んでいない（共通ロジックに集約する）', () => {
    // 例外: partnerId はロール別スコープと交差させる必要があり各ルートで扱う
    const allowed = ['filter[partnerId]'];
    for (const [name, source] of [
      ['一覧', listSource],
      ['CSV', csvSource],
    ] as const) {
      // コメント内の言及ではなく、実際の searchParams.get('filter[...]') のみを検出
      const matches = Array.from(
        source.matchAll(/searchParams\.get\(\s*['"](filter\[[a-zA-Z]+\])['"]/g),
      ).map((m) => m[1]);
      const unexpected = matches.filter((m) => !allowed.includes(m));
      expect(unexpected, `${name} API が filter[] を直接読んでいる`).toEqual([]);
    }
  });
});
