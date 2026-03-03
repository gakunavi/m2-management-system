-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "business_status_definitions" (
    "id" SERIAL NOT NULL,
    "business_id" INTEGER NOT NULL,
    "status_code" VARCHAR(50) NOT NULL,
    "status_label" VARCHAR(100) NOT NULL,
    "status_priority" INTEGER NOT NULL,
    "status_color" VARCHAR(20),
    "status_is_final" BOOLEAN NOT NULL DEFAULT false,
    "status_is_lost" BOOLEAN NOT NULL DEFAULT false,
    "status_sort_order" INTEGER NOT NULL DEFAULT 0,
    "status_is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "business_status_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movement_templates" (
    "id" SERIAL NOT NULL,
    "business_id" INTEGER NOT NULL,
    "step_number" INTEGER NOT NULL,
    "step_code" VARCHAR(50) NOT NULL,
    "step_name" VARCHAR(100) NOT NULL,
    "step_description" TEXT,
    "step_is_sales_linked" BOOLEAN NOT NULL DEFAULT false,
    "step_linked_status_code" VARCHAR(50),
    "step_config" JSONB NOT NULL DEFAULT '{}',
    "step_is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "movement_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_business_statuses_sort" ON "business_status_definitions"("business_id", "status_sort_order");

-- CreateIndex
CREATE INDEX "idx_business_statuses_final" ON "business_status_definitions"("business_id", "status_is_final");

-- CreateIndex
CREATE INDEX "idx_business_statuses_lost" ON "business_status_definitions"("business_id", "status_is_lost");

-- CreateIndex
CREATE UNIQUE INDEX "business_status_definitions_business_id_status_code_key" ON "business_status_definitions"("business_id", "status_code");

-- CreateIndex
CREATE INDEX "idx_movement_templates_sort" ON "movement_templates"("business_id", "step_number");

-- CreateIndex
CREATE UNIQUE INDEX "movement_templates_business_id_step_number_key" ON "movement_templates"("business_id", "step_number");

-- CreateIndex
CREATE INDEX "idx_businesses_code_active" ON "businesses"("business_code", "business_is_active");

-- CreateIndex
CREATE INDEX "idx_businesses_sort_order" ON "businesses"("business_sort_order");

-- AddForeignKey
ALTER TABLE "business_status_definitions" ADD CONSTRAINT "business_status_definitions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movement_templates" ADD CONSTRAINT "movement_templates_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
