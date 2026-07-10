// ============================================
// 発行パスワードの保管（可逆暗号化）
// ============================================
//
// 管理者・代理店管理者が発行済みパスワードを画面で確認できる仕様のため、
// bcrypt ハッシュとは別に「復号可能な形」で保持する必要がある。
// 平文のまま保存すると DB ダンプ流出時に全アカウントの資格情報が漏れるので、
// AES-256-GCM（用途別の派生鍵）で暗号化して保存する。
//
// 認証そのものは userPasswordHash（bcrypt）でのみ行い、
// ここで扱う値は「表示専用」であることに注意。

import { encrypt, decrypt, isEncrypted, ENCRYPTION_PURPOSE } from '@/lib/encryption';
import { logger } from '@/lib/logger';

/**
 * 発行パスワードを暗号化して保存用の文字列にする。
 */
export function encryptPassword(plainPassword: string): string {
  return encrypt(plainPassword, ENCRYPTION_PURPOSE.userPassword);
}

/**
 * 保存された発行パスワードを表示用に復号する。
 *
 * 復号できない場合は null を返す（例外を投げない）。
 * ユーザー一覧の取得が、1件の壊れたレコードで 500 になるのを防ぐため。
 *
 * 移行期の互換: 暗号文の形式でない値は、暗号化前に保存された平文とみなして
 * そのまま返す。全レコードの移行完了後はこの分岐を削除してよい。
 */
export function decryptPasswordSafe(stored: string | null): string | null {
  if (!stored) return null;

  if (!isEncrypted(stored)) {
    return stored;
  }

  try {
    return decrypt(stored, ENCRYPTION_PURPOSE.userPassword);
  } catch (error) {
    logger.error('発行パスワードの復号に失敗しました', error);
    return null;
  }
}
