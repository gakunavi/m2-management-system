import { describe, it, expect } from 'vitest';

// 本番 DB 用の単発スクリプトから変換だけを取り出す。
// このフラグを立てずに require すると DB へ繋ぎにいくので、require より前に置く
// （スクリプト側は `node -e` で走るため require.main では判定できない）
process.env.FIELD_SCRIPT_EXPORT_ONLY = '1';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildNext, FIELD, ANCHOR } = require('../../scripts/light-payment-status-field.js');

// ============================================
// 着金ステータスを本番のライト事業へ足す変換の検証
//
// 本番 DB には入れずに（石井さん 2026-11-09）、入れたらどうなるかをここで固定する。
// 流す前に MODE=dry で同じ結果が出ることを確かめてから apply する。
// ============================================

interface FieldDef {
  key: string;
  label: string;
  type: string;
  options?: string[];
  required?: boolean;
  sortOrder: number;
  visibleToPartner?: boolean;
}

/**
 * 本番ライト事業の案件カスタム項目の並び（2026-11-09 時点）。
 * `docs/backups/light-project-fields-20261107-before.json` の控えに
 * `scripts/light-project-date-fields.js` を当てた後の順。
 */
const PROD_ORDER = [
  'needs',
  'purchase_count',
  'purchase_unit_price',
  'unit_count',
  'purchase_amount',
  'temporary_lease_credit_application_status',
  'mitsubishi_lease_status',
  'ntt_finance_lease_status',
  'mitsui_sumitomo_lease_status',
  'lease_credit_application_status',
  'lease_application_status',
  'application_status',
  'industry_assoc_status',
  'industry_assoc_request_date',
  'industry_assoc_application_date',
  'industry_assoc_received_date',
  'industry_assoc_fee_payment_date',
  'industry_assoc_original_mailed_date',
  'sme_agency_applicant',
  'tax_incentive_status',
  'sme_agency_shared_date',
  'sme_agency_application_date',
  'sme_agency_approval_date',
  'sales_contract_status',
  'operation_contract_status',
  'logo_collection_status',
  'press_release_status',
  'appreciation_status',
  'first_meeting_date',
  'sales_contract_date',
  'operation_contract_date',
  'payment_received_date',
  'oogosho_csturl',
  'first_payment_date',
  'gratitude_certificate_name',
  'final_payment_date',
  'thank_you_recipient',
];

const prodFields = (): FieldDef[] =>
  PROD_ORDER.map((key, i) => ({ key, label: key, type: 'text', sortOrder: i + 1 }));

describe('着金ステータスの定義', () => {
  it('ほかの書類のステータスと同じ形（select・必須でない・代理店に出さない）', () => {
    expect(FIELD).toEqual({
      key: 'payment_status',
      type: 'select',
      label: '着金ステータス',
      options: ['1_着金済', '2_請求書送付済', '3_請求書未送付', '4_不要'],
      required: false,
      visibleToPartner: false,
    });
  });

  it('選べる値は指定された順・表記のまま', () => {
    expect(FIELD.options).toEqual(['1_着金済', '2_請求書送付済', '3_請求書未送付', '4_不要']);
  });

  it('絞り込み・ムーブメント表示は立てない（ほかの書類のステータスと同じ）', () => {
    expect(FIELD).not.toHaveProperty('filterable');
    expect(FIELD).not.toHaveProperty('showOnMovement');
  });
});

describe('本番の並びへの差し込み', () => {
  it('運用契約書ステータスの直後、26番目に入る', () => {
    const next = buildNext(prodFields());
    const index = next.findIndex((f: FieldDef) => f.key === 'payment_status');

    expect(next[index - 1].key).toBe(ANCHOR);
    expect(next[index - 1].key).toBe('operation_contract_status');
    expect(index + 1).toBe(26);
    expect(next[index].sortOrder).toBe(26);
  });

  it('ほかの項目は1件も増減せず、順番も変わらない', () => {
    const next = buildNext(prodFields());

    expect(next).toHaveLength(PROD_ORDER.length + 1);
    expect(next.filter((f: FieldDef) => f.key !== 'payment_status').map((f: FieldDef) => f.key)).toEqual(
      PROD_ORDER,
    );
  });

  it('sortOrder が1からの連番に振り直される（重複・欠番を残さない）', () => {
    const next = buildNext(prodFields());

    expect(next.map((f: FieldDef) => f.sortOrder)).toEqual(
      next.map((_: FieldDef, i: number) => i + 1),
    );
  });

  it('sortOrder が重複している定義でも今の画面の並びを保つ', () => {
    // 本番の控えには 28・29 の重複が残っていた。配列順で解決する
    const before: FieldDef[] = [
      { key: 'operation_contract_status', label: '運用契約書ステータス', type: 'select', sortOrder: 17 },
      { key: 'first_payment_date', label: '初回支払年月', type: 'month', sortOrder: 28 },
      { key: 'gratitude_certificate_name', label: '感謝状名義', type: 'text', sortOrder: 28 },
    ];

    expect(buildNext(before).map((f: FieldDef) => f.key)).toEqual([
      'operation_contract_status',
      'payment_status',
      'first_payment_date',
      'gratitude_certificate_name',
    ]);
  });
});

describe('書く前の確認（想定と違う状態では何も書かない）', () => {
  it('運用契約書ステータスが無ければ失敗する', () => {
    expect(() => buildNext([{ key: 'needs', label: 'ニーズ', type: 'select', sortOrder: 1 }])).toThrow(
      /operation_contract_status/,
    );
  });

  it('2回流しても二重に足さない（2回目は失敗する）', () => {
    const once = buildNext(prodFields());

    expect(() => buildNext(once)).toThrow(/既にあります/);
  });
});
