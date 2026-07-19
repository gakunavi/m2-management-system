-- 代理店報酬（会計）パイプライン
-- PartnerBusinessLink に報酬設定カラムを追加し、既存 commission_rate を
-- 直報酬(率)へ移行してから削除する。Project に案件別上書きカラム、
-- reward_statements / reward_entries を新設。

-- ============================================
-- 1) PartnerBusinessLink: 報酬カラムを追加（commission_rate はまだ残す）
-- ============================================
ALTER TABLE "partner_business_links"
  ADD COLUMN "direct_reward_type"    VARCHAR(10),
  ADD COLUMN "direct_reward_value"   DECIMAL(12,2),
  ADD COLUMN "indirect_reward_type"  VARCHAR(10),
  ADD COLUMN "indirect_reward_value" DECIMAL(12,2);

-- ============================================
-- 2) 既存 commission_rate（率で運用中）を直報酬へ移行
-- ============================================
UPDATE "partner_business_links"
SET "direct_reward_type" = 'rate',
    "direct_reward_value" = "commission_rate"
WHERE "commission_rate" IS NOT NULL;

-- ============================================
-- 3) 移行完了後、commission_rate を削除
-- ============================================
ALTER TABLE "partner_business_links" DROP COLUMN "commission_rate";

-- ============================================
-- 4) Project: 案件別の報酬上書き
-- ============================================
ALTER TABLE "projects"
  ADD COLUMN "direct_reward_override"   JSONB,
  ADD COLUMN "indirect_reward_override" JSONB;

-- ============================================
-- 5) reward_statements（支払明細書）
-- ============================================
CREATE TABLE "reward_statements" (
    "id" SERIAL NOT NULL,
    "business_id" INTEGER NOT NULL,
    "partner_id" INTEGER NOT NULL,
    "period_month" VARCHAR(7) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "statement_no" VARCHAR(50),
    "total_direct" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_indirect" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grand_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "file_storage_key" VARCHAR(500),
    "file_url" VARCHAR(500),
    "confirmed_at" TIMESTAMPTZ(6),
    "confirmed_by" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "reward_statements_pkey" PRIMARY KEY ("id")
);

-- ============================================
-- 6) reward_entries（明細行）
-- ============================================
CREATE TABLE "reward_entries" (
    "id" SERIAL NOT NULL,
    "statement_id" INTEGER NOT NULL,
    "project_id" INTEGER,
    "entry_type" VARCHAR(10) NOT NULL,
    "source_partner_id" INTEGER,
    "project_no_snapshot" VARCHAR(30),
    "customer_name_snapshot" VARCHAR(255),
    "base_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reward_type" VARCHAR(10) NOT NULL,
    "rate" DECIMAL(5,2),
    "reward_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reward_entries_pkey" PRIMARY KEY ("id")
);

-- ============================================
-- 7) インデックス
-- ============================================
CREATE INDEX "idx_reward_statements_biz_period" ON "reward_statements"("business_id", "period_month");
CREATE INDEX "idx_reward_statements_partner" ON "reward_statements"("partner_id");
CREATE UNIQUE INDEX "reward_statements_business_id_partner_id_period_month_key" ON "reward_statements"("business_id", "partner_id", "period_month");
CREATE INDEX "idx_reward_entries_statement" ON "reward_entries"("statement_id");
CREATE INDEX "idx_reward_entries_project" ON "reward_entries"("project_id");

-- ============================================
-- 8) 外部キー
-- ============================================
ALTER TABLE "reward_statements" ADD CONSTRAINT "reward_statements_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reward_statements" ADD CONSTRAINT "reward_statements_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reward_statements" ADD CONSTRAINT "reward_statements_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reward_entries" ADD CONSTRAINT "reward_entries_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "reward_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reward_entries" ADD CONSTRAINT "reward_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reward_entries" ADD CONSTRAINT "reward_entries_source_partner_id_fkey" FOREIGN KEY ("source_partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
