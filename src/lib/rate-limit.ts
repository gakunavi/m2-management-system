/**
 * インメモリ レート制限
 * 単一インスタンス向けのシンプルな実装。
 * スケール時は upstash/ratelimit (Redis) に差し替え可能。
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// 古いエントリを定期的にクリーンアップ（メモリリーク防止）
const CLEANUP_INTERVAL = 60_000; // 1分
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  store.forEach((entry, key) => {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  });
}

interface RateLimitConfig {
  /** ウィンドウ内の最大リクエスト数 */
  limit: number;
  /** ウィンドウのサイズ（ミリ秒） */
  windowMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * レート制限チェック
 * @param key 識別キー（IP, userId 等）
 * @param config 制限設定
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  cleanup();

  const now = Date.now();
  const entry = store.get(key);

  // エントリがない or ウィンドウが期限切れ → 新規
  if (!entry || entry.resetAt < now) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    store.set(key, newEntry);
    return { allowed: true, remaining: config.limit - 1, resetAt: newEntry.resetAt };
  }

  // ウィンドウ内 → カウント加算
  entry.count += 1;

  if (entry.count > config.limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { allowed: true, remaining: config.limit - entry.count, resetAt: entry.resetAt };
}

// ============================================
// プリセット設定
// ============================================

/** ログイン: 5回/分/IP */
export const AUTH_RATE_LIMIT: RateLimitConfig = {
  limit: 5,
  windowMs: 60_000,
};

/** ファイルアップロード: 10回/分/ユーザー */
export const UPLOAD_RATE_LIMIT: RateLimitConfig = {
  limit: 10,
  windowMs: 60_000,
};

/** 一般API: 100回/分/ユーザー */
export const API_RATE_LIMIT: RateLimitConfig = {
  limit: 100,
  windowMs: 60_000,
};
