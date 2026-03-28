-- 顧客マスタにグループ全体カスタムフィールド用JSON列を追加
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "customer_custom_data" JSONB DEFAULT '{}';

-- 代理店マスタにグループ全体カスタムフィールド用JSON列を追加
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "partner_custom_data" JSONB DEFAULT '{}';
