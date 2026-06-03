// ============================================
// エンティティ共通の選択肢定義（単一ソース）
// ============================================
// UI(列定義・フォーム)とサーバー側ソート(SortSpec)の双方がここを参照する。
// ここを並べ替えれば、画面表示順もソートの定義順も同時に変わる。

export const CUSTOMER_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '法人', label: '法人' },
  { value: '個人事業主', label: '個人事業主' },
  { value: '個人', label: '個人' },
  { value: '確認中', label: '確認中' },
  { value: '未設定', label: '未設定' },
];

export const PARTNER_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '法人', label: '法人' },
  { value: '個人事業主', label: '個人事業主' },
  { value: '個人', label: '個人' },
  { value: '確認中', label: '確認中' },
  { value: '未設定', label: '未設定' },
];

/** options 配列から value の順序配列を取り出す（SortSpec の select.order 用） */
export function optionOrder(
  options: readonly { value: string }[],
): readonly string[] {
  return options.map((o) => o.value);
}
