-- PartnerBusinessLink: 直/間の手数料率フィールド追加
ALTER TABLE "partner_business_links"
ADD COLUMN IF NOT EXISTS "direct_commission_rate" DECIMAL(7, 4),
ADD COLUMN IF NOT EXISTS "indirect_commission_rate" DECIMAL(7, 4);

-- 既存の commission_rate を direct_commission_rate に移行
UPDATE "partner_business_links"
SET "direct_commission_rate" = "commission_rate"
WHERE "commission_rate" IS NOT NULL
  AND "direct_commission_rate" IS NULL;

-- 会計パイプライン
CREATE TABLE IF NOT EXISTS "accounting_pipelines" (
    "id" SERIAL PRIMARY KEY,
    "project_id" INTEGER NOT NULL,
    "business_id" INTEGER NOT NULL,
    "revenue_type" VARCHAR(10) NOT NULL,
    "unit_price" DECIMAL(12, 2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "total_amount" DECIMAL(14, 2) NOT NULL,
    "billing_cycle" VARCHAR(50),
    "payment_method" VARCHAR(100),
    "operation_start_date" DATE,
    "memo" TEXT,
    "pipeline_is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_by" INTEGER,

    CONSTRAINT "accounting_pipelines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "accounting_pipelines_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "accounting_pipelines_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "accounting_pipelines_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_accounting_pipeline_project_business" ON "accounting_pipelines"("project_id", "business_id");
CREATE INDEX IF NOT EXISTS "idx_accounting_pipelines_business" ON "accounting_pipelines"("business_id");
CREATE INDEX IF NOT EXISTS "idx_accounting_pipelines_revenue_type" ON "accounting_pipelines"("revenue_type");

-- 着金エントリ
CREATE TABLE IF NOT EXISTS "pipeline_entries" (
    "id" SERIAL PRIMARY KEY,
    "pipeline_id" INTEGER NOT NULL,
    "entry_date" DATE NOT NULL,
    "amount" DECIMAL(14, 2) NOT NULL,
    "period_year" INTEGER NOT NULL,
    "period_month" INTEGER NOT NULL,
    "entry_status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "entry_memo" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_by" INTEGER,

    CONSTRAINT "pipeline_entries_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "accounting_pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pipeline_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "pipeline_entries_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_pipeline_entries_pipeline" ON "pipeline_entries"("pipeline_id");
CREATE INDEX IF NOT EXISTS "idx_pipeline_entries_period" ON "pipeline_entries"("period_year", "period_month");
CREATE INDEX IF NOT EXISTS "idx_pipeline_entries_status" ON "pipeline_entries"("entry_status");

-- 手数料分配
CREATE TABLE IF NOT EXISTS "commission_distributions" (
    "id" SERIAL PRIMARY KEY,
    "entry_id" INTEGER NOT NULL,
    "partner_id" INTEGER,
    "tier" INTEGER NOT NULL,
    "tier_label" VARCHAR(100),
    "rate_type" VARCHAR(10) NOT NULL,
    "commission_rate" DECIMAL(7, 4) NOT NULL,
    "commission_amount" DECIMAL(14, 2) NOT NULL,
    "is_manual_override" BOOLEAN NOT NULL DEFAULT false,
    "payment_due_date" DATE,
    "payment_status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "distribution_memo" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_distributions_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "pipeline_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "commission_distributions_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_commission_distributions_entry" ON "commission_distributions"("entry_id");
CREATE INDEX IF NOT EXISTS "idx_commission_distributions_partner" ON "commission_distributions"("partner_id");
CREATE INDEX IF NOT EXISTS "idx_commission_distributions_payment_status" ON "commission_distributions"("payment_status");

-- 支払い明細
CREATE TABLE IF NOT EXISTS "payment_statements" (
    "id" SERIAL PRIMARY KEY,
    "partner_id" INTEGER NOT NULL,
    "business_id" INTEGER NOT NULL,
    "period_year" INTEGER NOT NULL,
    "period_month" INTEGER NOT NULL,
    "total_amount" DECIMAL(14, 2) NOT NULL,
    "statement_status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "scheduled_issue_date" DATE,
    "issued_at" TIMESTAMPTZ(6),
    "pdf_url" VARCHAR(500),
    "statement_memo" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_by" INTEGER,

    CONSTRAINT "payment_statements_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payment_statements_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payment_statements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "payment_statements_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_payment_statement_partner_business_period" ON "payment_statements"("partner_id", "business_id", "period_year", "period_month");
CREATE INDEX IF NOT EXISTS "idx_payment_statements_business" ON "payment_statements"("business_id");
CREATE INDEX IF NOT EXISTS "idx_payment_statements_status" ON "payment_statements"("statement_status");
CREATE INDEX IF NOT EXISTS "idx_payment_statements_period" ON "payment_statements"("period_year", "period_month");

-- 支払い明細行
CREATE TABLE IF NOT EXISTS "payment_statement_lines" (
    "id" SERIAL PRIMARY KEY,
    "statement_id" INTEGER NOT NULL,
    "distribution_id" INTEGER,
    "project_id" INTEGER NOT NULL,
    "amount" DECIMAL(14, 2) NOT NULL,
    "commission_rate" DECIMAL(7, 4),
    "line_description" TEXT,
    "is_manual_entry" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_statement_lines_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "payment_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "payment_statement_lines_distribution_id_fkey" FOREIGN KEY ("distribution_id") REFERENCES "commission_distributions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "payment_statement_lines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_payment_statement_lines_statement" ON "payment_statement_lines"("statement_id");
CREATE INDEX IF NOT EXISTS "idx_payment_statement_lines_project" ON "payment_statement_lines"("project_id");
