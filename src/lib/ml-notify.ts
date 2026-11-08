// ============================================
// m2 側の変更を ML管理システムへ知らせる
// ============================================
//
// ライト事業の案件・顧客・顧客担当者が m2 で更新されたら、ML の受け口へ
// 「何が変わったか」だけを POST する。ML は通知を受けてから読み出しAPIを引く。
//
// 方針:
//   - 本文は種別とキー（project_no / customer_code）だけ。値・個人の連絡先は入れない
//   - HMAC-SHA256 で署名する。鍵・送信先は env。未設定なら送らない（no-op）
//   - ML から来た更新では送らない（ループ防止）
//   - 編集した人の画面を待たせない。控えを DB に入れてからレスポンス後に送る
//   - 失敗したら間隔を置いて数回リトライ。本番の cron は実運用されていないため、
//     次の通知の発生時に期限の来た pending 行をまとめて拾う
//     （integration-idempotency の遅延削除と同じ方針）

import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { logger } from '@/lib/logger';
import { isMlActor, type UpdateActor } from '@/lib/update-actor';

export type MlEventType =
  | 'project.updated'
  /** 案件の段階（ムーブメント）が変わった。案件本体の項目とは別の口を読み直す */
  | 'project.movements.updated'
  | 'customer.updated'
  | 'customer.contacts.updated';

/** 1回の sweep で送る上限（1リクエストの後処理が長引かないようにする） */
const DELIVER_BATCH_SIZE = 20;

/** リトライ間隔（秒）。attempts 回目の失敗後に次を待つ時間 */
export const ML_RETRY_DELAYS_SEC = [30, 300, 1_800, 10_800] as const;

/** 試行回数の上限（初回 + リトライ4回） */
export const ML_MAX_ATTEMPTS = ML_RETRY_DELAYS_SEC.length + 1;

/** 送信のタイムアウト（ミリ秒） */
const SEND_TIMEOUT_MS = 5_000;

export interface MlWebhookConfig {
  url: string;
  secret: string;
}

/** 送信先と鍵。どちらか欠けていたら null（＝通知機能そのものを無効にする） */
export function mlWebhookConfig(): MlWebhookConfig | null {
  const url = process.env.ML_WEBHOOK_URL?.trim();
  const secret = process.env.ML_WEBHOOK_SECRET?.trim();
  if (!url || !secret) return null;
  return { url, secret };
}

export interface MlNotificationBody {
  event_id: string;
  event_type: MlEventType;
  occurred_at: string;
  project_no?: string;
  customer_code?: string;
}

/**
 * 署名の計算。`<timestamp>.<body>` に対する HMAC-SHA256。
 *
 * timestamp を署名対象に含めるのは、本文だけを署名すると同じ本文を
 * あとから何度でも投げ直せる（リプレイ）ため。
 */
export function signMlPayload(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

/** 署名の検証（ML 側の実装確認用。m2 自身は使わないがテストと仕様の基準にする） */
export function verifyMlSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
): boolean {
  const expected = signMlPayload(secret, timestamp, rawBody);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface EnqueueInput {
  eventType: MlEventType;
  projectNo?: string | null;
  customerCode?: string | null;
}

/**
 * 通知を控えに積む。
 *
 * 呼び出し側（更新処理）は対象がライト事業であることを確認してから呼ぶ。
 * ML からの更新なら積まない（ループ防止）。
 *
 * 戻り値は積んだかどうか。false は「無効」か「ML 由来」。
 */
export async function enqueueMlNotification(
  prisma: PrismaClient,
  actor: UpdateActor,
  input: EnqueueInput,
): Promise<boolean> {
  if (isMlActor(actor)) return false;
  if (!mlWebhookConfig()) return false;

  try {
    await prisma.integrationOutboxEvent.create({
      data: {
        eventId: randomUUID(),
        eventType: input.eventType,
        projectNo: input.projectNo ?? null,
        customerCode: input.customerCode ?? null,
      },
    });
    return true;
  } catch (error) {
    // 通知の控えを作れなくても更新自体は成立させる
    logger.error('ML通知: 控えの作成に失敗しました', error, 'ml-notify');
    return false;
  }
}

export interface DeliverResult {
  sent: number;
  retrying: number;
  failed: number;
}

/**
 * 期限の来た pending 行を送る。
 *
 * レスポンスを返した後に `void` で呼ぶ想定（編集した人を待たせない）。
 * 失敗した行は次の sweep で拾われる。
 */
export async function deliverPendingMlNotifications(prisma: PrismaClient): Promise<DeliverResult> {
  const config = mlWebhookConfig();
  if (!config) return { sent: 0, retrying: 0, failed: 0 };

  const due = await prisma.integrationOutboxEvent.findMany({
    where: { status: 'pending', nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: 'asc' },
    take: DELIVER_BATCH_SIZE,
  });

  const result: DeliverResult = { sent: 0, retrying: 0, failed: 0 };

  for (const event of due) {
    const body: MlNotificationBody = {
      event_id: event.eventId,
      event_type: event.eventType as MlEventType,
      occurred_at: event.createdAt.toISOString(),
      ...(event.projectNo ? { project_no: event.projectNo } : {}),
      ...(event.customerCode ? { customer_code: event.customerCode } : {}),
    };

    const outcome = await sendOne(config, body);
    const attempts = event.attempts + 1;

    if (outcome.ok) {
      await prisma.integrationOutboxEvent.update({
        where: { id: event.id },
        data: { status: 'sent', attempts, sentAt: new Date(), lastError: null },
      });
      result.sent += 1;
      continue;
    }

    const exhausted = attempts >= ML_MAX_ATTEMPTS;
    const delaySec = ML_RETRY_DELAYS_SEC[Math.min(attempts - 1, ML_RETRY_DELAYS_SEC.length - 1)];
    await prisma.integrationOutboxEvent.update({
      where: { id: event.id },
      data: {
        status: exhausted ? 'failed' : 'pending',
        attempts,
        nextAttemptAt: new Date(Date.now() + delaySec * 1000),
        // 理由は個人の情報を含めない短い文字列のみ
        lastError: outcome.reason.slice(0, 500),
      },
    });
    if (exhausted) {
      result.failed += 1;
      logger.error(
        'ML通知: 上限まで送信に失敗しました',
        { eventId: event.eventId, eventType: event.eventType, reason: outcome.reason },
        'ml-notify',
      );
    } else {
      result.retrying += 1;
    }
  }

  return result;
}

type SendOutcome = { ok: true } | { ok: false; reason: string };

async function sendOne(config: MlWebhookConfig, body: MlNotificationBody): Promise<SendOutcome> {
  const rawBody = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));

  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-M2-Event-Id': body.event_id,
        'X-M2-Timestamp': timestamp,
        'X-M2-Signature': `sha256=${signMlPayload(config.secret, timestamp, rawBody)}`,
      },
      body: rawBody,
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` };
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.name : 'unknown error' };
  }
}

/**
 * 通知を積んで、送信はレスポンス後に回す。更新処理から呼ぶ入口。
 *
 * 控えの作成（DB への1行 INSERT）だけは await する。ここを非同期にすると、
 * レスポンスを返した直後にプロセスが落ちた場合に「更新は入ったが通知の控えも
 * 無い」状態になり、あとから拾い直せない。
 *
 * 送信そのものは待たない。送れなかった分は次の sweep で拾う。
 */
export async function queueMlNotification(
  prisma: PrismaClient,
  actor: UpdateActor,
  input: EnqueueInput,
): Promise<void> {
  const queued = await enqueueMlNotification(prisma, actor, input);
  if (!queued) return;

  void (async () => {
    try {
      await deliverPendingMlNotifications(prisma);
    } catch (error) {
      logger.error('ML通知: 送信処理で例外が発生しました', error, 'ml-notify');
    }
  })();
}
