/**
 * 保存済みビューの絞り込みと、config 側の既定絞り込み（`defaultFilters`）の合成。
 *
 * ビューは「ユーザーが明示的に作った状態」なので原則としてビューが勝つ。
 * ただし**キー単位**で判定する。ビューが値を持たないキーまでビューが勝つ扱いに
 * すると、既定絞り込み機能より前に作られたビュー（`filters: {}` で保存されている）
 * が標準フィルタを丸ごと打ち消してしまうため。
 *
 * 実際に本番で、契約マスタのデフォルトビューが `filters: {}` だったために
 * 失注除外の標準フィルタが効かない状態になっていた。
 *
 * なお絞り込みを解除すると `handleSetFilter` がキーごと削除するため、
 * 「未設定」と「意図的に解除」は保存内容から区別できない。区別が必要になったら
 * ビュー側に明示的な「解除」マーカーを持たせること。
 */
export function mergeViewFilters(
  viewFilters: Record<string, string> | null | undefined,
  defaultFilters: Record<string, string> | null | undefined,
): Record<string, string> {
  const view = viewFilters ?? {};
  const defaults = defaultFilters ?? {};
  if (Object.keys(defaults).length === 0) return { ...view };
  // ビューが持つキーは常にビューが勝つ（空文字も「ビューの値」として尊重する）
  return { ...defaults, ...view };
}
