-- 代理店報酬の「収益確定」判定用フラグ。
-- 失注を除外しつつ、受注以降の確定ステータスを事業ごとに指定できるようにする。
ALTER TABLE "business_status_definitions"
  ADD COLUMN "is_revenue_confirmed" BOOLEAN NOT NULL DEFAULT false;
