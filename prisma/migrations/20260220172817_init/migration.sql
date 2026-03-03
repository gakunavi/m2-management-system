-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "user_email" VARCHAR(255) NOT NULL,
    "user_password_hash" VARCHAR(255) NOT NULL,
    "user_name" VARCHAR(100) NOT NULL,
    "user_role" VARCHAR(20) NOT NULL,
    "user_partner_id" INTEGER,
    "user_is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" SERIAL NOT NULL,
    "business_code" VARCHAR(20) NOT NULL,
    "business_name" VARCHAR(100) NOT NULL,
    "business_description" TEXT,
    "business_config" JSONB NOT NULL DEFAULT '{}',
    "business_project_prefix" VARCHAR(10) NOT NULL,
    "business_is_active" BOOLEAN NOT NULL DEFAULT true,
    "business_sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_business_assignments" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "business_id" INTEGER NOT NULL,
    "assignment_role" VARCHAR(20) NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_business_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_user_email_key" ON "users"("user_email");

-- CreateIndex
CREATE INDEX "users_user_role_idx" ON "users"("user_role");

-- CreateIndex
CREATE INDEX "users_user_is_active_idx" ON "users"("user_is_active");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_business_code_key" ON "businesses"("business_code");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_business_project_prefix_key" ON "businesses"("business_project_prefix");

-- CreateIndex
CREATE INDEX "businesses_business_is_active_business_sort_order_idx" ON "businesses"("business_is_active", "business_sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "user_business_assignments_user_id_business_id_key" ON "user_business_assignments"("user_id", "business_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_business_assignments" ADD CONSTRAINT "user_business_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_business_assignments" ADD CONSTRAINT "user_business_assignments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
