-- 収益確定日（案件側のラッチ）。収益確定フラグ付きステータスに変わった時点で
-- 自動セットし、以降のステータス変更では自動で外さない（手動リセットのみ）。
-- 報酬対象判定と計上月をこの日付で行う（sortOrder 非依存・編集可）。
ALTER TABLE "projects"
  ADD COLUMN "revenue_confirmed_at" TIMESTAMPTZ(6);

CREATE INDEX "idx_projects_revenue_confirmed" ON "projects"("business_id", "revenue_confirmed_at");
