import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCustomerListWhere, buildPartnerListWhere } from '@/lib/master-filters';

const customerWhere = (q: string) => buildCustomerListWhere(new URLSearchParams(q));
const partnerWhere = (q: string) => buildPartnerListWhere(new URLSearchParams(q));

describe('buildCustomerListWhere', () => {
  it('条件なしなら空', () => {
    expect(customerWhere('')).toEqual({});
  });

  it('検索は顧客名・顧客コード・担当者名を対象にする', () => {
    expect(customerWhere('search=サンプル').OR).toEqual([
      { customerName: { contains: 'サンプル', mode: 'insensitive' } },
      { customerCode: { contains: 'サンプル', mode: 'insensitive' } },
      { contacts: { some: { contactName: { contains: 'サンプル', mode: 'insensitive' } } } },
    ]);
  });

  it('顧客種別は複数選択に対応する', () => {
    expect(customerWhere('filter[customerType]=法人,個人')).toEqual({
      customerType: { in: ['法人', '個人'] },
    });
  });

  it('業種IDは数値の in 条件になる', () => {
    expect(customerWhere('filter[industryId]=1,3')).toEqual({
      industryId: { in: [1, 3] },
    });
  });

  it('住所は部分一致', () => {
    expect(customerWhere('filter[customerAddress]=東京')).toEqual({
      customerAddress: { contains: '東京', mode: 'insensitive' },
    });
  });

  it('資本金の数値レンジ（チルダ区切り）', () => {
    expect(customerWhere('filter[customerCapital]=1000000~5000000')).toEqual({
      customerCapital: { gte: 1000000, lte: 5000000 },
    });
  });

  it('設立日の日付レンジ（to はその日を含む）', () => {
    const where = customerWhere('filter[customerEstablishedDate]=2020-01-01~2020-12-31');
    const cond = where.customerEstablishedDate as { gte: Date; lt: Date };
    expect(cond.gte).toEqual(new Date('2020-01-01'));
    // 終端は翌日未満（= 12/31 を含む）
    expect(cond.lt).toEqual(new Date('2021-01-01'));
  });

  it('有効ステータス', () => {
    expect(customerWhere('filter[isActive]=true')).toEqual({ customerIsActive: true });
    expect(customerWhere('filter[isActive]=false')).toEqual({ customerIsActive: false });
  });

  it('事業スコープは中間テーブル経由の条件になる', () => {
    expect(customerWhere('businessId=3')).toEqual({
      businessLinks: { some: { businessId: 3, linkStatus: 'active' } },
    });
  });

  it('不正な businessId は無視する', () => {
    expect(customerWhere('businessId=abc')).toEqual({});
  });
});

describe('buildPartnerListWhere', () => {
  it('検索は代理店名・代理店コード・担当者名を対象にする', () => {
    expect(partnerWhere('search=代理').OR).toEqual([
      { partnerName: { contains: '代理', mode: 'insensitive' } },
      { partnerCode: { contains: '代理', mode: 'insensitive' } },
      { contacts: { some: { contactName: { contains: '代理', mode: 'insensitive' } } } },
    ]);
  });

  it('代理店種別・階層は複数選択に対応する', () => {
    expect(partnerWhere('filter[partnerType]=法人&filter[partnerTier]=1次,2次')).toEqual({
      partnerType: { in: ['法人'] },
      partnerTier: { in: ['1次', '2次'] },
    });
  });

  it('住所・有効ステータス・事業スコープをまとめて適用できる', () => {
    expect(partnerWhere('filter[partnerAddress]=大阪&filter[isActive]=true&businessId=2')).toEqual({
      partnerAddress: { contains: '大阪', mode: 'insensitive' },
      partnerIsActive: true,
      businessLinks: { some: { businessId: 2, linkStatus: 'active' } },
    });
  });
});

// ============================================
// ドリフト検知
// ============================================
// 一覧 API と CSV エクスポート API が別々に where を組み立てると
// 「画面では絞り込めるが CSV は全件」という不一致が再発する。
describe('一覧APIとCSV APIの絞り込みロジック共有', () => {
  const base = join(__dirname, '../../src/app/api/v1');
  const cases = [
    { name: '顧客', builder: 'buildCustomerListWhere', dir: 'customers' },
    { name: '代理店', builder: 'buildPartnerListWhere', dir: 'partners' },
  ];

  for (const { name, builder, dir } of cases) {
    it(`${name}: 一覧・CSV の双方が ${builder} を使っている`, () => {
      const listSource = readFileSync(join(base, dir, 'route.ts'), 'utf-8');
      const csvSource = readFileSync(join(base, dir, 'csv/route.ts'), 'utf-8');
      expect(listSource).toContain(`${builder}(searchParams)`);
      expect(csvSource).toContain(`${builder}(searchParams)`);
    });

    it(`${name}: ルート内で filter[...] を直接読んでいない`, () => {
      for (const file of ['route.ts', 'csv/route.ts']) {
        const source = readFileSync(join(base, dir, file), 'utf-8');
        const matches = Array.from(
          source.matchAll(/searchParams\.get\(\s*['"](filter\[[a-zA-Z]+\])['"]/g),
        ).map((m) => m[1]);
        expect(matches, `${dir}/${file} が filter[] を直接読んでいる`).toEqual([]);
      }
    });
  }
});
