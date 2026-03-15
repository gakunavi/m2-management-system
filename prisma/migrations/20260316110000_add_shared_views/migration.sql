-- AlterTable
ALTER TABLE "saved_table_views" ADD COLUMN "is_shared" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "saved_table_views_table_key_is_shared_idx" ON "saved_table_views"("table_key", "is_shared");
