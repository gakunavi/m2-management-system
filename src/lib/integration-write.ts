// ============================================
// ML管理システムからの書き込みエンドポイント共通の入口
// ============================================
//
// 4つの書き込み口（案件PATCH・顧客PATCH・担当者 POST/PATCH/DELETE）で同じことを
// やるので、ここにまとめる:
//
//   1. 書き込み用トークンでの認証（読み取り用トークンでは 401）
//   2. ML 利用者名のヘッダー（変更履歴に残す名前）
//   3. JSON の読み取り
//   4. Idempotency-Key による再送検知（同じキー＋同じ内容 → 前回のレスポンス）
//   5. エラーの HTTP ステータスへの変換（409 / 422 / 404）
//
// レスポンス本文はログに出さない（顧客名・連絡先を含み得るため、ログには件数と
// キーだけ出す）。

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ApiError } from '@/lib/error-handler';
import { authorizeIntegrationRequest } from '@/lib/integration-auth';
import {
  findIdempotentResponse,
  hashRequestBody,
  saveIdempotentResponse,
} from '@/lib/integration-idempotency';
import { logger } from '@/lib/logger';
import { mlActorFromRequest, type UpdateActor } from '@/lib/update-actor';

/** Idempotency-Key の名前空間（エンドポイントを跨いだキー衝突を防ぐ） */
export const IDEMPOTENCY_SCOPE_ML_PROJECT = 'ml-project-write';
export const IDEMPOTENCY_SCOPE_ML_CUSTOMER = 'ml-customer-write';
export const IDEMPOTENCY_SCOPE_ML_CONTACT = 'ml-contact-write';
export const IDEMPOTENCY_SCOPE_ML_MOVEMENT = 'ml-movement-write';

export type ValidationError = { field: string; message: string };

/**
 * 1度だけ評価して結果を使い回す。
 *
 * 書き込み口は「対象がライト事業か」を handler と onConflict の両方で必要とするが、
 * 認証前に引いてしまうと、トークン無しのリクエストでも DB を叩くことになる。
 * handler の中で遅延評価し、2回目以降は結果を再利用する。
 */
export function once<T>(fn: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | null = null;
  return () => {
    if (promise === null) promise = fn();
    return promise;
  };
}

export interface IntegrationWriteContext {
  actor: UpdateActor;
  /** リクエストボディ（DELETE など本文の無いリクエストでは {}） */
  body: Record<string, unknown>;
}

export interface IntegrationWriteResult {
  status: number;
  body: Record<string, unknown> | null;
}

export interface IntegrationWriteOptions {
  /** Idempotency-Key の名前空間 */
  scope: string;
  /**
   * 冪等キーの対象を1リソースに閉じるための接尾辞（案件No・顧客コードなど）。
   * 同じキーで別のリソースを更新しようとしたら衝突として扱いたいので、
   * キーそのものではなくリクエストハッシュ側に混ぜる。
   */
  resourceKey: string;
  /** 本文を持たないリクエスト（DELETE）では true */
  allowEmptyBody?: boolean;
  handler: (context: IntegrationWriteContext) => Promise<IntegrationWriteResult>;
  /**
   * 409 のときに「現在値」を返すための取得関数。
   * ML はこれを見てセルの表示を最新へ直し、ユーザーに再編集させる。
   */
  onConflict?: () => Promise<Record<string, unknown> | null>;
  /** ログの出所タグ */
  logContext: string;
}

function validationResponse(errors: ValidationError[]): NextResponse {
  return NextResponse.json({ error: 'Validation failed', errors }, { status: 422 });
}

function zodErrors(error: ZodError): ValidationError[] {
  return error.errors.map((e) => ({ field: e.path.join('.') || '(body)', message: e.message }));
}

/**
 * ML からの書き込みリクエストを処理する。
 *
 * @returns そのままルートから返す NextResponse
 */
export async function handleIntegrationWrite(
  request: NextRequest,
  options: IntegrationWriteOptions,
): Promise<NextResponse> {
  // --- 認証（書き込み用トークンのみ。読み取り用では 401） ------------------
  const auth = authorizeIntegrationRequest(request, 'write');
  if (!auth.ok) return auth.response;

  // --- 変更者（変更履歴に "ML：<名前>" として残す） -----------------------
  const actorResult = mlActorFromRequest(request);
  if (!actorResult.ok) return validationResponse(actorResult.errors);
  const actor = actorResult.actor;

  // --- ボディ -------------------------------------------------------------
  let body: Record<string, unknown> = {};
  const rawText = await request.text();
  if (rawText.trim() !== '') {
    try {
      const parsed = JSON.parse(rawText);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
  } else if (!options.allowEmptyBody) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // --- 冪等キー -----------------------------------------------------------
  const idempotencyKey = request.headers.get('idempotency-key')?.trim() || null;
  const requestHash = hashRequestBody({
    method: request.method,
    resource: options.resourceKey,
    body,
  });

  try {
    if (idempotencyKey) {
      const previous = await findIdempotentResponse(options.scope, idempotencyKey);
      if (previous) {
        if (previous.requestHash !== requestHash) {
          return NextResponse.json(
            {
              error:
                'Idempotency-Key conflict: このキーは異なる内容のリクエストで既に使用されています',
            },
            { status: 409 },
          );
        }
        // 前回と同じリクエスト。DB は一切変更せず前回のレスポンスを返す
        if (previous.statusCode === 204) {
          return new NextResponse(null, { status: 204, headers: { 'Idempotent-Replay': 'true' } });
        }
        return NextResponse.json(previous.responseBody, {
          status: previous.statusCode,
          headers: { 'Idempotent-Replay': 'true' },
        });
      }
    }

    const result = await options.handler({ actor, body });

    // 記録するのは成功したときだけ。404（まだライト事業に紐づいていない等）を
    // 記録すると、あとで紐づけてから同じキーで再送しても 404 を返し続ける
    if (idempotencyKey && result.status < 400) {
      await saveIdempotentResponse(
        options.scope,
        idempotencyKey,
        requestHash,
        result.status,
        // 204 は本文が無い。記録は空オブジェクトにして status だけ再現する
        result.body ?? {},
      );
    }

    if (result.body === null) return new NextResponse(null, { status: result.status });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return await integrationErrorResponse(error, options);
  }
}

/**
 * エラーを ML が扱える形へ変換する。
 *
 * - 409: 先に更新されていた（現在値を添えて返す）
 * - 422: バリデーション違反（ML がセルの下に出す理由を field 単位で返す）
 * - 404: ライト事業の対象ではない／存在しない
 */
export async function integrationErrorResponse(
  error: unknown,
  options: Pick<IntegrationWriteOptions, 'onConflict' | 'logContext'>,
): Promise<NextResponse> {
  if (error instanceof ZodError) {
    return validationResponse(zodErrors(error));
  }

  if (error instanceof ApiError) {
    if (error.statusCode === 409) {
      const current = options.onConflict ? await options.onConflict() : null;
      return NextResponse.json(
        { error: 'Conflict', message: error.message, current },
        { status: 409 },
      );
    }
    if (error.statusCode === 400 || error.statusCode === 422) {
      // 画面向けの ApiError は 400 を使うが、ML には「直せる入力の誤り」として 422 で返す
      return validationResponse(
        error.details && error.details.length > 0
          ? error.details
          : [{ field: '(body)', message: error.message }],
      );
    }
    if (error.statusCode === 404) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (error.statusCode === 403) {
      return NextResponse.json({ error: 'Forbidden', message: error.message }, { status: 403 });
    }
  }

  // 顧客名・連絡先を含み得るので、エラー内容以外は出さない
  logger.error('連携API: 書き込みに失敗しました', error, options.logContext);
  return NextResponse.json({ error: 'Internal error' }, { status: 500 });
}
