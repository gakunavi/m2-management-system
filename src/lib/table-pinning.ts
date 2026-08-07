// ============================================
// 一覧テーブルの列固定（フリーズペイン）レイアウト計算
// ============================================
// sticky で列を固定する場合、固定列は必ず
//   「テーブルの左端に、固定列だけが連続して並んでいる」
// 状態でなければならない。元の並び順のまま sticky にすると、
// 固定列より左にある列が横スクロール時に固定列の下へ潜り込んで消える。
//
// そのため
//   1. withPinnedFirst() で固定列を先頭（プレフィックス列の直後）へ寄せ
//   2. computeFrozenLayout() で左オフセットを幅の累積から求める
// の2段構えにする。

/** 常に左端に置かれる内部列（選択チェックボックス / 詳細を開く） */
export const PREFIX_COLUMN_IDS = ['_select', '_open'];

export type FrozenColumn = { id: string; size: number };

export type FrozenLayout = {
  /** 固定列ID -> sticky の left(px) */
  offsets: Record<string, number>;
  /** 固定ブロックの右端の列ID（境界の影を出すため）。固定なしなら null */
  lastId: string | null;
};

/**
 * 固定列を先頭へ寄せた列順を返す。
 * プレフィックス列（_select / _open）は常に最左のまま維持する。
 * 固定が無い場合は入力をそのまま返す（並び順を変えない）。
 */
export function withPinnedFirst(columnOrder: string[], pinnedCols: string[]): string[] {
  if (pinnedCols.length === 0) return columnOrder;

  const pinnedSet = new Set(pinnedCols);
  const prefix = columnOrder.filter((id) => PREFIX_COLUMN_IDS.includes(id));
  // ピン留めした順に左から並べる
  const pinned = pinnedCols.filter(
    (id) => columnOrder.includes(id) && !PREFIX_COLUMN_IDS.includes(id),
  );
  const rest = columnOrder.filter(
    (id) => !PREFIX_COLUMN_IDS.includes(id) && !pinnedSet.has(id),
  );

  return [...prefix, ...pinned, ...rest];
}

/**
 * 固定ブロック（プレフィックス列 + 固定列）の sticky オフセットを計算する。
 *
 * 1列でも固定されている場合、プレフィックス列も一緒に固定する。
 * そうしないと固定列の左に隙間ができ、そこへ通常列が潜り込んで見えてしまう。
 * 何も固定していない場合は空を返し、従来どおり全列がスクロールする。
 *
 * @param visibleCols 表示中の列を**表示順**で渡すこと（withPinnedFirst 適用後の順序）
 */
export function computeFrozenLayout(
  visibleCols: FrozenColumn[],
  pinnedCols: string[],
): FrozenLayout {
  if (pinnedCols.length === 0) return { offsets: {}, lastId: null };

  const pinnedSet = new Set(pinnedCols);
  const frozen = visibleCols.filter(
    (c) => PREFIX_COLUMN_IDS.includes(c.id) || pinnedSet.has(c.id),
  );
  if (frozen.length === 0) return { offsets: {}, lastId: null };

  const offsets: Record<string, number> = {};
  let left = 0;
  for (const col of frozen) {
    offsets[col.id] = left;
    left += col.size;
  }

  return { offsets, lastId: frozen[frozen.length - 1].id };
}
