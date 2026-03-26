-- 自己参照の代理店データを修復
-- マスタ: parentId が自分自身を指している場合、1次代理店としてクリア
UPDATE "Partner"
SET "parentId" = NULL,
    "partnerTier" = '1次代理店'
WHERE "parentId" = "id";

-- 事業別: businessParentId が自分自身を指している場合、クリア
UPDATE "PartnerBusinessLink"
SET "businessParentId" = NULL,
    "businessTier" = NULL,
    "businessTierNumber" = NULL
WHERE "businessParentId" = "partnerId";

-- 自己参照を防止する CHECK 制約を追加（IF NOT EXISTS で冪等）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'partner_no_self_parent'
  ) THEN
    ALTER TABLE "Partner" ADD CONSTRAINT partner_no_self_parent CHECK ("parentId" IS NULL OR "parentId" != "id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'partner_business_link_no_self_parent'
  ) THEN
    ALTER TABLE "PartnerBusinessLink" ADD CONSTRAINT partner_business_link_no_self_parent CHECK ("businessParentId" IS NULL OR "businessParentId" != "partnerId");
  END IF;
END $$;
