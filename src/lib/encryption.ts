// ============================================
// AES-256-GCM 暗号化/復号ユーティリティ
// ============================================

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * 暗号化キーを取得（環境変数 or NEXTAUTH_SECRET から派生）
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('ENCRYPTION_KEY または NEXTAUTH_SECRET が設定されていません');
  }
  // 32バイトのキーに派生
  return scryptSync(secret, 'system-settings-salt', 32);
}

/**
 * 文字列を AES-256-GCM で暗号化
 * @returns "iv:encrypted:authTag" 形式の文字列
 */
export function encrypt(plainText: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
}

/**
 * AES-256-GCM で暗号化された文字列を復号
 * @param encryptedText "iv:encrypted:authTag" 形式の文字列
 */
export function decrypt(encryptedText: string): string {
  const key = getEncryptionKey();
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('暗号化データの形式が不正です');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const authTag = Buffer.from(parts[2], 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * APIキーをマスク表示用に変換
 * "sk-proj-abc...xyz" → "sk-proj-abc...****"
 */
export function maskApiKey(key: string): string {
  if (key.length <= 8) return '****';
  return `${key.substring(0, 8)}...****`;
}
