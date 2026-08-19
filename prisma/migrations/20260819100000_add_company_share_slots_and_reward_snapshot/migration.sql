-- 会計まわり: (1) 自社受取率の代理店グループ層 (2) 収益確定時の料率凍結
--
-- ── (1) partner_business_links.company_share_slots ──
-- メーカーから自社に入る販売手数料（自社受取率）は、これまで事業デフォルトと
-- 案件別上書きの2層しか無かった。実務では「どの代理店グループ経由の案件か」で
-- メーカーとの手数料が変わるため、代理店リンクに層を追加する。
--
-- 値を持つのは1次代理店のリンクのみ。案件の担当が2次・3次代理店でも、
-- 階層を最上位まで遡って1次代理店の値を使う（＝代理店グループ単位で決まる）。
-- 構造は CompanyShare の部分JSON:
--   { "shot": {"type":"rate","value":18}, "stock": {"type":"fixed","value":3000} }
-- NULL / {} = 上書きなし（事業デフォルトを使用）。
--
-- ── (2) projects.reward_snapshot ──
-- 収益確定（revenue_confirmed_at のセット）時点の実効料率を丸ごと焼き付ける。
-- これが入っている案件は、以後マスタの料率を変更しても金額計算が動かない。
-- NULL = 未凍結（従来どおりマスタから毎回計算＝新しい料率が反映される）。
--
-- 既存の収益確定済み案件へのバックフィルは
-- scripts/backfill-reward-snapshots.ts で別途実行する（現行の実効値をそのまま
-- 焼き付けるため、移行の前後で金額は1円も変わらない）。

ALTER TABLE "partner_business_links"
  ADD COLUMN "company_share_slots" JSONB;

ALTER TABLE "projects"
  ADD COLUMN "reward_snapshot" JSONB;

-- バックフィル対象（reward_snapshot が未設定の収益確定済み案件）を引くための部分インデックス。
CREATE INDEX "idx_projects_reward_snapshot_missing"
  ON "projects" ("business_id")
  WHERE "revenue_confirmed_at" IS NOT NULL AND "reward_snapshot" IS NULL;
