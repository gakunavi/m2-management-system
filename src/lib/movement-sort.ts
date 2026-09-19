/**
 * 案件ムーブメント「案件情報」列の並び替え定義。
 *
 * 並び替えの候補は「ムーブメントの案件情報欄に表示している項目」と一致させる。
 * 受注予定月・顧客名・代理店名（常に表示）＋ 案件カスタムフィールドのうち
 * showOnMovement が立っているもの。表示していない項目で並び替えると
 * 「何順なのか画面から分からない」状態になるため、候補を増やす設定は作らず
 * 既存の showOnMovement フラグに寄せている。
 *
 * 既定の並び順だけは事業ごとに変えたいので
 * businessConfig.movementSettings.defaultSort に保存する。
 */

export type MovementSortDirection = 'asc' | 'desc';

export type MovementSortOption = {
  /** 並び替えキー。カスタムフィールドは `custom_<フィールドキー>` */
  key: string;
  label: string;
  /** 比較方法の決定に使う型（EntityFieldDefinition['type'] 相当） */
  type: string;
};

export type MovementSortSetting = {
  key: string;
  direction: MovementSortDirection;
};

/** カスタムフィールド由来の並び替えキーの接頭辞 */
export const CUSTOM_SORT_KEY_PREFIX = 'custom_';

/** 常に「案件情報」欄に出ている項目 */
export const MOVEMENT_CORE_SORT_OPTIONS: MovementSortOption[] = [
  { key: 'projectExpectedCloseMonth', label: '受注予定月', type: 'month' },
  { key: 'customerName', label: '顧客名', type: 'text' },
  { key: 'partnerName', label: '代理店名', type: 'text' },
];

/** カスタムフィールドキー → 並び替えキー */
export function toCustomSortKey(fieldKey: string): string {
  return `${CUSTOM_SORT_KEY_PREFIX}${fieldKey}`;
}

/** 並び替えキー → カスタムフィールドキー（コア項目なら null） */
export function toCustomFieldKey(sortKey: string): string | null {
  return sortKey.startsWith(CUSTOM_SORT_KEY_PREFIX)
    ? sortKey.slice(CUSTOM_SORT_KEY_PREFIX.length)
    : null;
}

/**
 * 並び替え候補を組み立てる。
 * 引数は事業の projectFields 全件でよい（showOnMovement は内部で絞る）。
 */
export type MovementSortFieldLike = {
  key: string;
  label: string;
  /** EntityFieldDefinition['type'] 相当。JSON 由来は string のままなので広く受ける */
  type: string;
  sortOrder: number;
  showOnMovement?: boolean;
};

export function buildMovementSortOptions(
  projectFields: MovementSortFieldLike[],
): MovementSortOption[] {
  const customOptions = projectFields
    .filter((f) => f.showOnMovement)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((f) => ({ key: toCustomSortKey(f.key), label: f.label, type: f.type }));
  return [...MOVEMENT_CORE_SORT_OPTIONS, ...customOptions];
}

/**
 * businessConfig.movementSettings.defaultSort を検証して返す。
 * 候補から外れたキー（表示を外した項目など）は無視して null を返す。
 */
export function resolveMovementDefaultSort(
  raw: unknown,
  options: MovementSortOption[],
): MovementSortSetting | null {
  if (!raw || typeof raw !== 'object') return null;
  const { key, direction } = raw as { key?: unknown; direction?: unknown };
  if (typeof key !== 'string') return null;
  if (!options.some((o) => o.key === key)) return null;
  return { key, direction: direction === 'desc' ? 'desc' : 'asc' };
}

export type MovementSortValue = string | number | boolean | null | undefined;

/**
 * 並び替え用の比較。direction まで含めた最終的な符号を返す。
 * 空値（null / undefined / 空文字）は昇順・降順どちらでも常に末尾。
 * 「値が無い行が降順の先頭に来る」のを避けるため、direction の反転を
 * 空値判定の後に行う必要があり、比較関数の中に direction を持たせている。
 */
export function compareMovementSortValues(
  a: MovementSortValue,
  b: MovementSortValue,
  type: string,
  direction: MovementSortDirection,
): number {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  let cmp: number;
  if ((type === 'number' || type === 'formula') && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
    cmp = Number(a) - Number(b);
  } else if (type === 'checkbox') {
    const ab = a === true || a === 'true';
    const bb = b === true || b === 'true';
    cmp = ab === bb ? 0 : ab ? 1 : -1;
  } else {
    // date / month は ISO 文字列なので辞書順で日付順になる
    cmp = String(a).localeCompare(String(b), 'ja');
  }
  return direction === 'desc' ? -cmp : cmp;
}
