-- 顧客担当者に携帯番号を足す
-- 2026-11-07 石井さん「MO の担当者にも携帯を足す」。ML管理システムが持つ
-- MO担当者の写しと両方向でそろえるため、営業管理システム側に列を持つ。
ALTER TABLE "customer_contacts" ADD COLUMN "contact_mobile" VARCHAR(20);
