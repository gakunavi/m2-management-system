-- AlterTable
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "portal_visible" BOOLEAN NOT NULL DEFAULT true;
