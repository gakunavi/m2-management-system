import { getStorageAdapter } from './index';
import { logger } from '@/lib/logger';

// ============================================
// ダウンロードURLの生成
// ============================================
//
// アップロードしたファイルは非公開バケットに保存されているため、
// DBに保存された公開URL（https://bucket.s3.../key）を直接開いても 403 になる。
// 参照時に短命の署名付きURLを都度発行する。
//
// 認可は各APIルート側で行っている（例: portal/documents は代理店スコープを確認）。
// 「メタデータを取得できた＝閲覧を許可された」利用者だけが、有効期限つきの
// URLを受け取れる、という前提でアクセス制御が成立する。

/**
 * 保存済みの公開URLから S3 キーを取り出す。
 * すでにキー形式（"business-documents/..."）ならそのまま返す。
 */
export function extractStorageKey(keyOrUrl: string): string {
  if (!/^https?:\/\//i.test(keyOrUrl)) {
    // 先頭スラッシュを除いたキー
    return keyOrUrl.replace(/^\/+/, '');
  }
  try {
    const { pathname } = new URL(keyOrUrl);
    return decodeURIComponent(pathname.replace(/^\/+/, ''));
  } catch {
    return keyOrUrl;
  }
}

/**
 * ダウンロード用URLを発行する。
 *
 * @param storageKey - 保存時の key（推奨）。無ければ第2引数の公開URLから抽出する
 * @param fallbackUrl - key が空のときに使う保存済みURL（旧データ互換）
 */
export async function getDownloadUrl(
  storageKey: string | null | undefined,
  fallbackUrl?: string | null,
): Promise<string> {
  const source = storageKey && storageKey.trim() !== '' ? storageKey : fallbackUrl;
  if (!source) return '';

  const key = extractStorageKey(source);
  try {
    return await getStorageAdapter().getDownloadUrl(key);
  } catch (error) {
    logger.error('ダウンロードURLの発行に失敗しました', error);
    // 発行に失敗しても一覧取得全体を落とさない。
    // （非公開バケットでは開けないが、少なくとも 500 は避ける）
    return fallbackUrl ?? '';
  }
}
