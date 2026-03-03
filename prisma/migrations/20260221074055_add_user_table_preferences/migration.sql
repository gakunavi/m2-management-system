-- CreateTable
CREATE TABLE "user_table_preferences" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "table_key" VARCHAR(100) NOT NULL,
    "settings" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_table_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_table_preferences_user_id_idx" ON "user_table_preferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_table_preferences_user_id_table_key_key" ON "user_table_preferences"("user_id", "table_key");

-- AddForeignKey
ALTER TABLE "user_table_preferences" ADD CONSTRAINT "user_table_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
