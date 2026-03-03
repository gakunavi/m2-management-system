-- CreateTable
CREATE TABLE "customer_bank_accounts" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "business_id" INTEGER,
    "bank_name" VARCHAR(100) NOT NULL,
    "branch_name" VARCHAR(100) NOT NULL,
    "account_type" VARCHAR(10) NOT NULL,
    "account_number" VARCHAR(20) NOT NULL,
    "account_holder" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "customer_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_customer_bank_accounts_customer" ON "customer_bank_accounts"("customer_id");

-- AddForeignKey
ALTER TABLE "customer_bank_accounts" ADD CONSTRAINT "customer_bank_accounts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_bank_accounts" ADD CONSTRAINT "customer_bank_accounts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
