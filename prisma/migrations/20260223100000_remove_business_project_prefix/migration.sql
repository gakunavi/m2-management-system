-- DropIndex
DROP INDEX IF EXISTS "businesses_business_project_prefix_key";

-- AlterTable
ALTER TABLE "businesses" DROP COLUMN "business_project_prefix";
