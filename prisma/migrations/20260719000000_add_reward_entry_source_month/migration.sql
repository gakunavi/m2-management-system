-- RewardEntry に発生月(source_month)を追加。
-- ComputedRewardEntry.sourceMonth を締めスナップショットに固定するための監査列。
-- 確定後の明細は不変のため、支払月が同じでも発生月が異なる行（支払タイミング特例の
-- 途中変更など）を後から区別するには source_month が必須。後追いバックフィルは不可能。
--
-- reward_entries は締め機能未実装のため実データは無い（DEFAULT は制約充足のための暫定）。
-- reward_kind 追加時と同じく、DEFAULT を付与 → 既存行バックフィル担保 → DEFAULT を外して
-- schema.prisma（NOT NULL・DEFAULT 無し）と一致させる。

ALTER TABLE "reward_entries"
  ADD COLUMN "source_month" VARCHAR(7) NOT NULL DEFAULT '';

ALTER TABLE "reward_entries" ALTER COLUMN "source_month" DROP DEFAULT;
