-- 法人番号の一意制約。
--
-- 適用前に本番DBで重複を確認済み（2026-07-30 実施・ECS run-task による読み取り専用クエリ）:
--   顧客 173 件中、法人番号が入っているのは 8 件。重複 0 件・空文字 0 件。
--
-- PostgreSQL の UNIQUE 索引は NULL 同士を重複と見なさないため、これは実質
-- 「NOT NULL のときだけ一意」として機能する。法人番号を持たない顧客
-- （個人事業主・個人）は何件でも NULL のまま共存できる。
--
-- 空文字については、全書き込み経路（顧客POST / 顧客PATCH / CSV取込 / 取り込みAPI）が
-- `|| null` で null に正規化しているため、'' 同士の衝突は発生しない。
--
-- 重複投入時は Prisma が P2002 を返し、既存の error-handler が 409 に変換する。

CREATE UNIQUE INDEX "customers_customer_corporate_number_key"
  ON "customers"("customer_corporate_number");
