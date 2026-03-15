-- AlterTable
ALTER TABLE "business_documents" ADD COLUMN "document_sort_order" INTEGER NOT NULL DEFAULT 0;

-- Backfill: assign sort order based on existing createdAt order (ascending = oldest first at top)
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY business_id, document_type
    ORDER BY created_at ASC
  ) AS rn
  FROM "business_documents"
)
UPDATE "business_documents" bd
SET "document_sort_order" = o.rn
FROM ordered o
WHERE bd.id = o.id;
