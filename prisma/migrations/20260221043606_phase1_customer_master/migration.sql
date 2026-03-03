-- CreateTable
CREATE TABLE "customers" (
    "id" SERIAL NOT NULL,
    "customer_code" VARCHAR(20) NOT NULL,
    "customer_name" VARCHAR(200) NOT NULL,
    "customer_salutation" VARCHAR(100),
    "customer_type" VARCHAR(20) NOT NULL DEFAULT '未設定',
    "customer_postal_code" VARCHAR(10),
    "customer_address" TEXT,
    "customer_phone" VARCHAR(20),
    "customer_fax" VARCHAR(20),
    "customer_email" VARCHAR(255),
    "customer_website" VARCHAR(500),
    "customer_industry" VARCHAR(100),
    "customer_corporate_number" VARCHAR(13),
    "customer_invoice_number" VARCHAR(14),
    "customer_capital" BIGINT,
    "customer_established_date" DATE,
    "customer_folder_url" VARCHAR(500),
    "customer_notes" TEXT,
    "customer_is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_contacts" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
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

    CONSTRAINT "customer_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_contact_business_links" (
    "id" SERIAL NOT NULL,
    "contact_id" INTEGER NOT NULL,
    "business_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_contact_business_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_business_links" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "business_id" INTEGER NOT NULL,
    "link_status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "link_custom_data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "customer_business_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_customer_code_key" ON "customers"("customer_code");

-- CreateIndex
CREATE INDEX "idx_customers_code_active" ON "customers"("customer_code", "customer_is_active");

-- CreateIndex
CREATE INDEX "idx_customers_name" ON "customers"("customer_name");

-- CreateIndex
CREATE INDEX "idx_customers_industry" ON "customers"("customer_industry");

-- CreateIndex
CREATE INDEX "idx_customers_type" ON "customers"("customer_type");

-- CreateIndex
CREATE INDEX "idx_customers_created_at" ON "customers"("created_at");

-- CreateIndex
CREATE INDEX "idx_customers_active_updated" ON "customers"("customer_is_active", "updated_at");

-- CreateIndex
CREATE INDEX "customer_contacts_customer_id_idx" ON "customer_contacts"("customer_id");

-- CreateIndex
CREATE INDEX "idx_contact_business_links_business" ON "customer_contact_business_links"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_contact_business_links_contact_id_business_id_key" ON "customer_contact_business_links"("contact_id", "business_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_business_links_customer_id_business_id_key" ON "customer_business_links"("customer_id", "business_id");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_contact_business_links" ADD CONSTRAINT "customer_contact_business_links_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "customer_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_contact_business_links" ADD CONSTRAINT "customer_contact_business_links_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_business_links" ADD CONSTRAINT "customer_business_links_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_business_links" ADD CONSTRAINT "customer_business_links_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
