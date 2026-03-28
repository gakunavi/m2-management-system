/**
 * エンティティ固有フィールドの定義。
 * businesses.businessConfig.{projectFields|customerFields|partnerFields} に格納される。
 * グローバル定義は system_settings.globalCustomerFields / globalPartnerFields に格納。
 */
export interface EntityFieldDefinition {
  /** JSONキー（custom_data のキー） */
  key: string;
  /** 表示ラベル */
  label: string;
  /** フィールドの型 */
  type: 'text' | 'textarea' | 'number' | 'date' | 'month' | 'select' | 'checkbox' | 'url' | 'formula';
  /** select型の選択肢 */
  options?: string[];
  /** formula型のみ: 計算式（例: 'unit_price * quantity'） */
  formula?: string;
  /** 入力必須か */
  required?: boolean;
  /** 入力ヒント・プレースホルダー */
  description?: string;
  /** 表示順 */
  sortOrder: number;
  /** 代理店ユーザーに表示するか */
  visibleToPartner?: boolean;
  /** 一覧画面のフィルターに表示するか */
  filterable?: boolean;
  /** 契約マスタ一覧にも表示するか（顧客/代理店フィールドのみ） */
  showOnProject?: boolean;
}

/**
 * 後方互換エイリアス。
 * 既存コードの ProjectFieldDefinition 参照をそのまま維持する。
 */
export type ProjectFieldDefinition = EntityFieldDefinition;
