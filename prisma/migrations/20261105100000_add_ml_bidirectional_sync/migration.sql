-- ML管理システムとの双方向連携（PATCH /api/integrations/** と ML への変更通知）向けの追加。
--
-- 方針: 追加のみ。既存カラムの削除・リネーム・型変更は行わない。
-- ⚠️ 本番DBには未適用（石井さんの承認後に別途 `prisma migrate deploy`）。
--
-- integration_change_logs:
--   ML から書き込まれた変更の履歴。m2 には変更履歴テーブルが無く、更新者は
--   projects/customers の updated_by（User への FK）でしか表せない。ML の利用者は
--   m2 のユーザーではないため FK に載せられないので、「誰が・どの項目を」を別に残す。
--   値そのものは保存しない（個人の連絡先が履歴に溜まるのを避ける）。
--
-- integration_outbox_events:
--   m2 側の変更を ML へ知らせる通知の控え（送信キュー）。本文は種別とキーだけ。
--   送信は非同期で、失敗したら next_attempt_at を後ろにずらして数回リトライする。

CREATE TABLE "integration_change_logs" (
    "id" SERIAL NOT NULL,
    "entity_type" VARCHAR(20) NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "entity_key" VARCHAR(50),
    "action" VARCHAR(10) NOT NULL,
    "actor_label" VARCHAR(100) NOT NULL,
    "changed_fields" TEXT[] NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_change_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "integration_change_logs_entity_type_entity_id_created_at_idx"
  ON "integration_change_logs"("entity_type", "entity_id", "created_at");

CREATE INDEX "integration_change_logs_created_at_idx"
  ON "integration_change_logs"("created_at");

CREATE TABLE "integration_outbox_events" (
    "id" SERIAL NOT NULL,
    "event_id" VARCHAR(64) NOT NULL,
    "event_type" VARCHAR(40) NOT NULL,
    "project_no" VARCHAR(30),
    "customer_code" VARCHAR(20),
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),
    "last_error" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_outbox_events_event_id_key"
  ON "integration_outbox_events"("event_id");

CREATE INDEX "integration_outbox_events_status_next_attempt_at_idx"
  ON "integration_outbox_events"("status", "next_attempt_at");
