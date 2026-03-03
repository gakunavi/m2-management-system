-- AlterTable
ALTER TABLE "partners" ADD COLUMN     "parent_id" INTEGER,
ADD COLUMN     "partner_tier_number" VARCHAR(50);

-- CreateIndex
CREATE INDEX "idx_partners_parent_id" ON "partners"("parent_id");

-- CreateIndex
CREATE INDEX "idx_partners_tier_number" ON "partners"("partner_tier_number");

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
