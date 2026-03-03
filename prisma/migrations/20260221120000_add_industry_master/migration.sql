-- CreateTable
CREATE TABLE "industries" (
    "id" SERIAL NOT NULL,
    "industry_name" VARCHAR(100) NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "industries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "industries_industry_name_key" ON "industries"("industry_name");

-- CreateIndex
CREATE INDEX "industries_is_active_display_order_idx" ON "industries"("is_active", "display_order");

-- AlterTable: Add industryId to customers
ALTER TABLE "customers" ADD COLUMN "industry_id" INTEGER;

-- Migrate existing industry data: insert distinct values into industries
INSERT INTO "industries" ("industry_name", "display_order", "is_active", "updated_at")
SELECT DISTINCT "customer_industry", 0, true, NOW()
FROM "customers"
WHERE "customer_industry" IS NOT NULL AND "customer_industry" != ''
ORDER BY "customer_industry";

-- Update customers.industry_id based on existing customerIndustry text
UPDATE "customers" c
SET "industry_id" = i."id"
FROM "industries" i
WHERE c."customer_industry" = i."industry_name";

-- Drop old column
ALTER TABLE "customers" DROP COLUMN "customer_industry";

-- Drop old index (if exists)
DROP INDEX IF EXISTS "idx_customers_industry";

-- CreateIndex for industry_id
CREATE INDEX "idx_customers_industry_id" ON "customers"("industry_id");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_industry_id_fkey" FOREIGN KEY ("industry_id") REFERENCES "industries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
