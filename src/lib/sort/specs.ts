// ============================================
// 統一ソート基盤 — エンティティ別 SortSpec
// ============================================
// 各列の「並べ方」を1か所で宣言する単一ソース。
// 既存のホワイトリストを db 既定にし、特殊な並び（select=定義順 / natural=自然順 /
// relation=リレーション越し / status=ステータス順）だけ上書きする。

import {
  CUSTOMER_SORT_FIELDS,
  PARTNER_SORT_FIELDS,
  BUSINESS_SORT_FIELDS,
} from '@/lib/sort-helper';
import {
  CUSTOMER_TYPE_OPTIONS,
  PARTNER_TYPE_OPTIONS,
  optionOrder,
} from '@/constants/entity-options';
import type { SortSpec } from './types';

/** 全フィールドを db 戦略にした SortSpec を生成 */
function dbSpec(fields: readonly string[]): SortSpec {
  return Object.fromEntries(fields.map((f) => [f, { kind: 'db' as const }]));
}

// 顧客: 種別のみ定義順、他は db
export const CUSTOMER_SORT_SPEC: SortSpec = {
  ...dbSpec(CUSTOMER_SORT_FIELDS),
  customerType: { kind: 'select', order: optionOrder(CUSTOMER_TYPE_OPTIONS) },
};

// 代理店: 種別=定義順、階層/階層番号=自然順、他は db
export const PARTNER_SORT_SPEC: SortSpec = {
  ...dbSpec(PARTNER_SORT_FIELDS),
  partnerType: { kind: 'select', order: optionOrder(PARTNER_TYPE_OPTIONS) },
  partnerTier: { kind: 'natural' },
  partnerTierNumber: { kind: 'natural' },
};

// 事業: すべて db
export const BUSINESS_SORT_SPEC: SortSpec = {
  ...dbSpec(BUSINESS_SORT_FIELDS),
};

// ユーザー: すべて db
export const USER_SORT_SPEC: SortSpec = dbSpec([
  'userName',
  'userEmail',
  'userRole',
  'userIsActive',
  'createdAt',
  'updatedAt',
]);

// 代理店スタッフ: すべて db
export const PARTNER_STAFF_SORT_SPEC: SortSpec = dbSpec([
  'userName',
  'userEmail',
  'userIsActive',
  'createdAt',
]);

// 案件CSV: 生モデル行に対して適用するため、フラットな db列 + ステータスのみ対応
// （CSVのソート許可フィールドは元々この範囲。リレーション/カスタムは対象外）
export const PROJECT_CSV_SORT_SPEC: SortSpec = {
  projectNo: { kind: 'db' },
  projectSalesStatus: { kind: 'status' },
  projectExpectedCloseMonth: { kind: 'db' },
  projectAssignedUserName: { kind: 'db' },
  updatedAt: { kind: 'db' },
  createdAt: { kind: 'db' },
};

// 案件: リレーション越し・ステータス・顧客種別(定義順)を宣言。
// 動的カラム(customData_/customerLink_/partnerLink_)は実行時に withCustomDataFields で付与。
export const PROJECT_SORT_SPEC: SortSpec = {
  // 直接フィールド
  projectNo: { kind: 'db' },
  projectExpectedCloseMonth: { kind: 'db' },
  projectAssignedUserName: { kind: 'db' },
  projectNotes: { kind: 'db' },
  portalVisible: { kind: 'db' },
  updatedAt: { kind: 'db' },
  createdAt: { kind: 'db' },
  // リレーション越し（顧客）
  customerName: { kind: 'relation', path: ['customer', 'customerName'] },
  customerSalutation: { kind: 'relation', path: ['customer', 'customerSalutation'] },
  customerWebsite: { kind: 'relation', path: ['customer', 'customerWebsite'] },
  customerFiscalMonth: { kind: 'relation', path: ['customer', 'customerFiscalMonth'] },
  customerFolderUrl: { kind: 'relation', path: ['customer', 'customerFolderUrl'] },
  // リレーション越し（代理店）
  partnerName: { kind: 'relation', path: ['partner', 'partnerName'] },
  partnerCode: { kind: 'relation', path: ['partner', 'partnerCode'] },
  partnerSalutation: { kind: 'relation', path: ['partner', 'partnerSalutation'] },
  partnerFolderUrl: { kind: 'relation', path: ['partner', 'partnerFolderUrl'] },
  // リレーション越し（事業）
  businessName: { kind: 'relation', path: ['business', 'businessName'] },
  // 顧客種別は定義順（顧客・代理店マスタと同じルールに統一）
  customerType: { kind: 'select', order: optionOrder(CUSTOMER_TYPE_OPTIONS) },
  // 営業ステータスは statusSortOrder 順
  projectSalesStatus: { kind: 'status' },
};
