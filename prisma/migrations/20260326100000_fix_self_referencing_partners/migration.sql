-- 自己参照の代理店データを修復
-- マスタ: parent_id が自分自身を指している場合、1次代理店としてクリア
UPDATE "partners"
SET "parent_id" = NULL,
    "partner_tier" = '1次代理店'
WHERE "parent_id" = "id";

-- 事業別: business_parent_id が自分自身を指している場合、クリア
UPDATE "partner_business_links"
SET "business_parent_id" = NULL,
    "business_tier" = NULL,
    "business_tier_number" = NULL
WHERE "business_parent_id" = "partner_id";

-- 自己参照を防止する CHECK 制約を追加（IF NOT EXISTS で冪等）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'partner_no_self_parent'
  ) THEN
    ALTER TABLE "partners" ADD CONSTRAINT partner_no_self_parent CHECK ("parent_id" IS NULL OR "parent_id" != "id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'partner_business_link_no_self_parent'
  ) THEN
    ALTER TABLE "partner_business_links" ADD CONSTRAINT partner_business_link_no_self_parent CHECK ("business_parent_id" IS NULL OR "business_parent_id" != "partner_id");
  END IF;
END $$;
