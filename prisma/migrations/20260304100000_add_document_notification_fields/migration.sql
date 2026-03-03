-- AlterTable
ALTER TABLE "business_documents" ADD COLUMN "last_notified_at" TIMESTAMPTZ(6),
ADD COLUMN "last_notified_by" INTEGER;

-- AddForeignKey
ALTER TABLE "business_documents" ADD CONSTRAINT "business_documents_last_notified_by_fkey" FOREIGN KEY ("last_notified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
