// ============================================
// ストレージキーの検証
// ============================================
//
// catch-all ルート（/api/v1/upload/[...key]）は URL のセグメントを
// そのままキーとして受け取るため、`..` を含むキーを渡されると
// LocalStorageAdapter の path.join が basePath の外を指し、
// 保存領域外のファイルを削除できてしまう。
//
// 本番は S3（キーはリテラル扱い）だが、ローカル/開発と
// 将来のアダプタ差し替えに備えてキー自体を検証する。

/** キーとして安全か（相対参照・絶対パス・NULバイトを含まないか） */
export function isSafeStorageKey(key: string): boolean {
  if (!key) return false;
  if (key.includes('\0')) return false;
  // 絶対パス・Windows ドライブレター
  if (key.startsWith('/') || key.startsWith('\\') || /^[a-zA-Z]:/.test(key)) return false;

  // バックスラッシュ区切りも考慮してセグメント単位で判定
  const segments = key.split(/[/\\]/);
  if (segments.some((s) => s === '..' || s === '.')) return false;

  return true;
}

/** 安全でないキーなら例外を投げる */
export function assertSafeStorageKey(key: string): void {
  if (!isSafeStorageKey(key)) {
    throw new Error(`不正なストレージキーです: ${key}`);
  }
}
