// ============================================
// システム設定: DBから取得（.envフォールバックなし）
// ============================================

import { prisma } from './prisma';
import { decrypt } from './encryption';

// メモリキャッシュ（サーバー再起動でクリア）
const cache = new Map<string, { value: string; expiresAt: number }>();
const CACHE_TTL_MS = 60_000; // 1分

/**
 * システム設定値をDBから取得
 * DB未設定の場合は null を返す（.envフォールバックなし）
 */
export async function getSystemSetting(key: string): Promise<string | null> {
  // キャッシュチェック
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { settingKey: key },
    });

    if (setting) {
      const value = setting.isEncrypted ? decrypt(setting.settingValue) : setting.settingValue;
      cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
      return value;
    }
  } catch {
    // DB取得失敗
  }

  return null;
}

/**
 * AI機能が利用可能かチェック（APIキーがDBに設定済みか）
 */
export async function isAiConfigured(): Promise<boolean> {
  const apiKey = await getSystemSetting(SETTING_KEYS.OPENAI_API_KEY);
  return !!apiKey;
}

/**
 * キャッシュをクリア（設定更新時に呼び出し）
 */
export function clearSettingsCache(key?: string): void {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}

// よく使う設定キーの定数
export const SETTING_KEYS = {
  OPENAI_API_KEY: 'openai_api_key',
  OPENAI_MODEL: 'openai_model',
} as const;
