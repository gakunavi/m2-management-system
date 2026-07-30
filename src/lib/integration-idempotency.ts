// ============================================
// Idempotency-Key の記録と再送検知
// ============================================
//
// 同じ Idempotency-Key で再度呼ばれたら、DB を変更せず前回と同じレスポンスを返す。
// 同じキーで「異なるボディ」が来た場合は 409（呼び出し側のキー生成バグを黙って飲み込まない）。
//
// 保持期間は 30 日。本番の cron は実運用されていないため、
// 書き込み時に期限切れレコードを遅延削除する（別ジョブに依存しない）。

import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';

export const IDEMPOTENCY_RETENTION_DAYS = 30;

/** キーの名前空間（エンドポイントを跨いだキー衝突を防ぐ） */
export const IDEMPOTENCY_SCOPE_CUSTOMER_IMPORT = 'customer-import';

/**
 * オブジェクトのキー順に依存しない安定 JSON 文字列化。
 * 同じ内容なら常に同じハッシュになるようにする。
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** リクエストボディのハッシュ（ボディそのものは保存しない） */
export function hashRequestBody(body: unknown): string {
  return createHash('sha256').update(stableStringify(body)).digest('hex');
}

export interface StoredIdempotentResponse {
  requestHash: string;
  statusCode: number;
  responseBody: unknown;
}

/** 記録済みレスポンスの取得（期限切れは無いものとして扱う） */
export async function findIdempotentResponse(
  scope: string,
  key: string,
): Promise<StoredIdempotentResponse | null> {
  const record = await prisma.integrationIdempotencyKey.findUnique({
    where: { scope_idempotencyKey: { scope, idempotencyKey: key } },
    select: { requestHash: true, statusCode: true, responseBody: true, expiresAt: true },
  });
  if (!record) return null;
  if (record.expiresAt.getTime() <= Date.now()) return null;
  return {
    requestHash: record.requestHash,
    statusCode: record.statusCode,
    responseBody: record.responseBody,
  };
}

/**
 * レスポンスの記録。
 * responseBody には機微情報を含めないこと（id / url / 更新項目名のみを想定）。
 */
export async function saveIdempotentResponse(
  scope: string,
  key: string,
  requestHash: string,
  statusCode: number,
  responseBody: unknown,
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + IDEMPOTENCY_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  // 期限切れの遅延削除（cron に依存しない）
  await prisma.integrationIdempotencyKey.deleteMany({ where: { expiresAt: { lt: now } } });

  await prisma.integrationIdempotencyKey.upsert({
    where: { scope_idempotencyKey: { scope, idempotencyKey: key } },
    create: {
      scope,
      idempotencyKey: key,
      requestHash,
      statusCode,
      responseBody: responseBody as object,
      expiresAt,
    },
    update: {
      requestHash,
      statusCode,
      responseBody: responseBody as object,
      expiresAt,
    },
  });
}
