-- AlterTable
ALTER TABLE "partners" ADD COLUMN     "partner_bp_form_key" VARCHAR(500),
ADD COLUMN     "partner_bp_form_url" VARCHAR(500),
ADD COLUMN     "partner_capital" BIGINT,
ADD COLUMN     "partner_corporate_number" VARCHAR(13),
ADD COLUMN     "partner_invoice_number" VARCHAR(14);
