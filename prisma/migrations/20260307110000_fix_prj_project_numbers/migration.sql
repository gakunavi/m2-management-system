-- PRJ-xxxx の案件番号を事業コード(business_code)ベースに一括更新
-- 連番部分はそのまま維持し、プレフィックスのみ置換する
UPDATE projects p
SET project_no = b.business_code || SUBSTRING(p.project_no FROM 4)
FROM businesses b
WHERE p.business_id = b.id
  AND p.project_no LIKE 'PRJ-%';
