-- AlterTable: task_board_members に tab_order カラムを追加
-- 既存マイグレーション修正後に追加されたカラムの差分適用
ALTER TABLE "task_board_members" ADD COLUMN IF NOT EXISTS "tab_order" INTEGER NOT NULL DEFAULT 0;
