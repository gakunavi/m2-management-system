-- 案件別の自社取り分（レベニューシェア）上書きを追加。
--
-- 自社取り分は事業デフォルト（businessConfig.rewardConfig.companyShare）を基本とするが、
-- 「通常は販売額の20%だがこの契約だけ15%」のような個別条件が実務で発生するため、
-- 案件単位で上書きできるようにする。構造は CompanyShare の部分JSON:
--   { "shot": {"type":"rate","value":15}, "stock": {"type":"fixed","value":3000} }
--
-- reward_override と同じく NULL 許容（NULL / {} = 上書きなし＝事業デフォルトを使用）。
-- 既存行のバックフィルは不要（NULL がそのまま「上書きなし」を意味する）。

ALTER TABLE "projects"
  ADD COLUMN "company_share_override" JSONB;
