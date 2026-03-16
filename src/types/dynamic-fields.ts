/**
 * 事業固有フィールドの定義。
 * businesses.businessConfig.projectFields に格納される。
 */
export interface ProjectFieldDefinition {
  /** JSONキー（project_custom_data のキー） */
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
}
