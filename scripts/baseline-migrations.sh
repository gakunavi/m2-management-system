#!/bin/sh
# 既存の本番DBに対して全マイグレーションを「適用済み」としてマークする
# ECS RunTask で1回だけ実行する
set -e

MIGRATIONS="
20260220172817_init
20260221043606_phase1_customer_master
20260221074055_add_user_table_preferences
20260221120000_add_industry_master
20260221185938_
20260222101340_add_saved_table_views
20260222122548_add_partner_master
20260222141032_add_partner_hierarchy
20260222171244_add_partner_corporate_fields
20260223021218_add_customer_bank_accounts
20260223100000_remove_business_project_prefix
20260225100000_add_project_assigned_user_name
20260227100000_add_project_files
20260228100000_add_business_to_qa_item
20260303100000_add_project_renovation_number
20260304100000_add_document_notification_fields
"

for migration in $MIGRATIONS; do
  echo "Resolving: $migration"
  npx prisma migrate resolve --applied "$migration" 2>&1 || echo "  (already resolved or error)"
done

echo "Done. All existing migrations marked as applied."
