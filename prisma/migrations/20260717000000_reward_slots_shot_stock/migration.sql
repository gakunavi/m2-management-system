-- 報酬設定をショット×ストック×直×間接の RewardSlots(JSON) 構造へ作り直す。
-- Phase0 で入れたフラット列（direct/indirect × type/value）を JSON へ移行してから削除。

-- ============================================
-- 1) PartnerBusinessLink: rewardSlots / 支払いタイミング特例を追加
-- ============================================
ALTER TABLE "partner_business_links"
  ADD COLUMN "reward_slots"   JSONB,
  ADD COLUMN "payment_timing" VARCHAR(20),
  ADD COLUMN "closing_day"    INTEGER;

-- 既存のフラット報酬（＝commission_rate 由来のショット直/間接）を shot スロットへ移行
UPDATE "partner_business_links"
SET "reward_slots" = jsonb_strip_nulls(jsonb_build_object(
  'shot', jsonb_strip_nulls(jsonb_build_object(
    'direct',   CASE WHEN "direct_reward_value"   IS NOT NULL
                     THEN jsonb_build_object('type', "direct_reward_type",   'value', "direct_reward_value") END,
    'indirect', CASE WHEN "indirect_reward_value" IS NOT NULL
                     THEN jsonb_build_object('type', "indirect_reward_type", 'value', "indirect_reward_value") END
  ))
))
WHERE "direct_reward_value" IS NOT NULL OR "indirect_reward_value" IS NOT NULL;

ALTER TABLE "partner_business_links"
  DROP COLUMN "direct_reward_type",
  DROP COLUMN "direct_reward_value",
  DROP COLUMN "indirect_reward_type",
  DROP COLUMN "indirect_reward_value";

-- ============================================
-- 2) Project: rewardOverride / 解約日 / ストック固定期間 を追加、旧 override 列を統合
-- ============================================
ALTER TABLE "projects"
  ADD COLUMN "reward_override"    JSONB,
  ADD COLUMN "cancelled_at"       TIMESTAMPTZ(6),
  ADD COLUMN "stock_term_months" INTEGER;

-- 旧 direct/indirect override（あれば）を shot スロットへ移行
UPDATE "projects"
SET "reward_override" = jsonb_strip_nulls(jsonb_build_object(
  'shot', jsonb_strip_nulls(jsonb_build_object(
    'direct',   "direct_reward_override",
    'indirect', "indirect_reward_override"
  ))
))
WHERE "direct_reward_override" IS NOT NULL OR "indirect_reward_override" IS NOT NULL;

ALTER TABLE "projects"
  DROP COLUMN "direct_reward_override",
  DROP COLUMN "indirect_reward_override";

-- ============================================
-- 3) RewardEntry: ショット/ストック区分を追加
-- ============================================
ALTER TABLE "reward_entries"
  ADD COLUMN "reward_kind" VARCHAR(10) NOT NULL DEFAULT 'shot';

-- 既存行のバックフィル後、DEFAULT を外して schema と一致させる
ALTER TABLE "reward_entries" ALTER COLUMN "reward_kind" DROP DEFAULT;
