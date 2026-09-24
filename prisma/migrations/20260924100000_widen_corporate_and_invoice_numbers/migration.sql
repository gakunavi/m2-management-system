-- 法人番号・インボイス番号を自由記述にする。
--
-- 「なし」「申請中」などを入れられるよう形式チェックを外し、桁数上限を 13/14 → 100 に広げる。
-- 同じ「なし」を複数社に入れられないと困るため、法人番号の UNIQUE 索引（20260730090000）も外す。
-- 取り込みAPIの新規作成時の重複チェックは、13桁の数字のときだけアプリ側で行う（customer-import.ts）。
--
-- 拡張と索引の削除だけなので、既存データは変わらない。
DROP INDEX IF EXISTS "customers_customer_corporate_number_key";
ALTER TABLE "customers" ALTER COLUMN "customer_corporate_number" TYPE VARCHAR(100);
ALTER TABLE "customers" ALTER COLUMN "customer_invoice_number" TYPE VARCHAR(100);
ALTER TABLE "partners" ALTER COLUMN "partner_corporate_number" TYPE VARCHAR(100);
ALTER TABLE "partners" ALTER COLUMN "partner_invoice_number" TYPE VARCHAR(100);
