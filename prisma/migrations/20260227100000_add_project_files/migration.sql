-- CreateTable
CREATE TABLE "project_files" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_storage_key" VARCHAR(500) NOT NULL,
    "file_url" VARCHAR(500) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_mime_type" VARCHAR(100) NOT NULL,
    "file_category" VARCHAR(100),
    "file_description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,

    CONSTRAINT "project_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_project_files_project_id" ON "project_files"("project_id");

-- CreateIndex
CREATE INDEX "idx_project_files_project_category" ON "project_files"("project_id", "file_category");

-- AddForeignKey
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
