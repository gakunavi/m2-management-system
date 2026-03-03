-- CreateTable
CREATE TABLE "partners" (
    "id" SERIAL NOT NULL,
    "partner_code" VARCHAR(20) NOT NULL,
    "partner_tier" VARCHAR(50),
    "partner_name" VARCHAR(200) NOT NULL,
    "partner_salutation" VARCHAR(100),
    "partner_type" VARCHAR(20) NOT NULL DEFAULT '未設定',
    "partner_postal_code" VARCHAR(10),
    "partner_address" TEXT,
    "partner_phone" VARCHAR(20),
    "partner_fax" VARCHAR(20),
    "partner_email" VARCHAR(255),
    "partner_website" VARCHAR(500),
    "partner_established_date" DATE,
    "industry_id" INTEGER,
    "partner_folder_url" VARCHAR(500),
    "partner_notes" TEXT,
    "partner_is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_contacts" (
    "id" SERIAL NOT NULL,
    "partner_id" INTEGER NOT NULL,
    "contact_name" VARCHAR(100) NOT NULL,
    "contact_department" VARCHAR(100),
    "contact_position" VARCHAR(100),
    "contact_is_representative" BOOLEAN NOT NULL DEFAULT false,
    "contact_phone" VARCHAR(20),
    "contact_fax" VARCHAR(20),
    "contact_email" VARCHAR(255),
    "contact_business_card_front_url" VARCHAR(500),
    "contact_business_card_back_url" VARCHAR(500),
    "contact_is_primary" BOOLEAN NOT NULL DEFAULT false,
    "contact_sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "partner_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_contact_business_links" (
    "id" SERIAL NOT NULL,
    "contact_id" INTEGER NOT NULL,
    "business_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_contact_business_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_bank_accounts" (
    "id" SERIAL NOT NULL,
    "partner_id" INTEGER NOT NULL,
    "business_id" INTEGER,
    "bank_name" VARCHAR(100) NOT NULL,
    "branch_name" VARCHAR(100) NOT NULL,
    "account_type" VARCHAR(10) NOT NULL,
    "account_number" VARCHAR(20) NOT NULL,
    "account_holder" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "partner_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partners_partner_code_key" ON "partners"("partner_code");

-- CreateIndex
CREATE INDEX "idx_partners_code_active" ON "partners"("partner_code", "partner_is_active");

-- CreateIndex
CREATE INDEX "idx_partners_name" ON "partners"("partner_name");

-- CreateIndex
CREATE INDEX "idx_partners_industry_id" ON "partners"("industry_id");

-- CreateIndex
CREATE INDEX "idx_partners_type" ON "partners"("partner_type");

-- CreateIndex
CREATE INDEX "idx_partners_created_at" ON "partners"("created_at");

-- CreateIndex
CREATE INDEX "idx_partners_active_updated" ON "partners"("partner_is_active", "updated_at");

-- CreateIndex
CREATE INDEX "partner_contacts_partner_id_idx" ON "partner_contacts"("partner_id");

-- CreateIndex
CREATE INDEX "idx_partner_contact_business_links_business" ON "partner_contact_business_links"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "partner_contact_business_links_contact_id_business_id_key" ON "partner_contact_business_links"("contact_id", "business_id");

-- CreateIndex
CREATE INDEX "idx_partner_bank_accounts_partner" ON "partner_bank_accounts"("partner_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_user_partner_id_fkey" FOREIGN KEY ("user_partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_industry_id_fkey" FOREIGN KEY ("industry_id") REFERENCES "industries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_contacts" ADD CONSTRAINT "partner_contacts_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_contact_business_links" ADD CONSTRAINT "partner_contact_business_links_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "partner_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_contact_business_links" ADD CONSTRAINT "partner_contact_business_links_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_bank_accounts" ADD CONSTRAINT "partner_bank_accounts_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_bank_accounts" ADD CONSTRAINT "partner_bank_accounts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
