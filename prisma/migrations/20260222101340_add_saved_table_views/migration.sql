-- CreateTable
CREATE TABLE "saved_table_views" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "table_key" VARCHAR(100) NOT NULL,
    "view_name" VARCHAR(100) NOT NULL,
    "settings" JSONB NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "saved_table_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_table_views_user_id_table_key_idx" ON "saved_table_views"("user_id", "table_key");

-- AddForeignKey
ALTER TABLE "saved_table_views" ADD CONSTRAINT "saved_table_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
