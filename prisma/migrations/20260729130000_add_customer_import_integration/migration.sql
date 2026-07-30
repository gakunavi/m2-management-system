-- 顧客取り込みAPI（POST /api/integrations/customers/import）向けの追加。
--
-- 方針: 追加のみ。既存カラムの削除・リネーム・型変更は行わない。
--
-- 顧客の特定キー（MO番号）は既存の事業別カスタムフィールドを使うため、カラム追加は不要:
--   businesses.business_config.customerFields に {key:"mo_no", label:"MO番号"} が定義済みで、
--   実データは customer_business_links.link_custom_data->>'mo_no' に入っている
--   （2026-07-30 本番確認: ライト事業の顧客リンク75件すべてに存在・全件ユニーク・空文字なし）。
--
-- integration_idempotency_keys:
--   Idempotency-Key の記録。同一キーの再送で DB を変更せず前回と同じレスポンスを返す。
--   保持期間 30 日。cron に依存せず、書き込み時に期限切れを遅延削除する。
--   dry_run のリクエストはこのテーブルを一切使わない（冪等キーを消費しない）。

CREATE TABLE "integration_idempotency_keys" (
    "id" SERIAL NOT NULL,
    "scope" VARCHAR(50) NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "status_code" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "integration_idempotency_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_idempotency_keys_scope_idempotency_key_key"
  ON "integration_idempotency_keys"("scope", "idempotency_key");

CREATE INDEX "integration_idempotency_keys_expires_at_idx"
  ON "integration_idempotency_keys"("expires_at");
