/**
 * 遷移元パンくず（`?from=` パラメータ）の生成ヘルパー。
 *
 * 一覧 → 詳細 と遷移したあと一覧に戻ったときに、絞り込み・ソート・ページ・
 * 表示件数といった一覧の状態（URL クエリ）が失われないよう、遷移時点の
 * `location.search` を含めた href を from に埋め込む。
 *
 * 形式: `?from=<encodeURIComponent(`${href},${label}`)>`
 * href 側にクエリ（`&` や `,` を含む）が入るため、必ず URL エンコードする。
 */
export function buildFromParam(label: string, fallbackPath: string): string {
  const href =
    typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}`
      : fallbackPath;
  return encodeURIComponent(`${href},${label}`);
}
