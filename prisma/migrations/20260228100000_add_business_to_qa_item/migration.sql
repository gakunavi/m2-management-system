-- AlterTable
ALTER TABLE "qa_items" ADD COLUMN "business_id" INTEGER;

-- CreateIndex
CREATE INDEX "qa_items_business_id_idx" ON "qa_items"("business_id");

-- AddForeignKey
ALTER TABLE "qa_items" ADD CONSTRAINT "qa_items_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
