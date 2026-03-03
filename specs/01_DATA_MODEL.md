# データモデル設計書

## 1. 全体構造

### 1.1 レイヤー構成

```
会社レベル（事業横断）
├── users              ... ユーザーマスタ
├── businesses         ... 事業定義
├── customers          ... 顧客マスタ
├── customer_contacts  ... 顧客担当者（事業別対応）
├── customer_business_links ... 顧客×事業リンク（事業固有情報）
├── partners           ... 代理店マスタ
├── partner_contacts   ... 代理店担当者
└── partner_business_links ... 代理店×事業リンク

事業レベル（事業ごと）
├── business_status_definitions ... 営業ステータス定義
├── movement_templates          ... ムーブメントテンプレート
├── projects                    ... 案件
├── project_movements           ... 案件ムーブメント進捗
├── movement_logs               ... ムーブメントログ
├── project_files               ... 案件ファイル
├── monthly_reports             ... 月次レポート
└── budget_targets              ... 売上目標（予実管理）

共通機能
├── qa_categories      ... QAカテゴリ
├── qa_items           ... QA項目
├── inquiries          ... 問い合わせ
├── user_preferences   ... ユーザー設定
├── notifications      ... 通知
├── user_table_preferences ... ユーザーテーブル設定
├── user_table_views       ... テーブルビュー（名前付き表示条件の保存）
└── audit_logs         ... 監査ログ
```

### 1.2 ER図（テキスト表現）

```
businesses ──< business_status_definitions
    │
    ├──< movement_templates
    │
    ├──< projects >──── customers
    │       │                │
    │       │           customer_contacts
    │       │                └── customer_contact_business_links >── businesses（担当者×事業）
    │       │                │
    │       │           customer_business_links >── businesses（事業固有情報）
    │       │
    │       ├──── partners
    │       │        │
    │       │   partner_contacts
    │       │        │
    │       │   partner_business_links >── businesses
    │       │
    │       ├──< project_movements
    │       │       └──< movement_logs
    │       │
    │       └──< project_files
    │
    ├──< monthly_reports
    │
    └──< budget_targets

users ──< user_business_assignments >── businesses
users ──< notifications
users ──< user_table_preferences
users ──< user_table_views
users ──< audit_logs
```

---

## 2. テーブル定義

### 2.1 会社レベル

#### businesses（事業定義）

| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | SERIAL | PK | 事業ID |
| business_code | VARCHAR(20) | UNIQUE, NOT NULL | 事業コード（例: "moag", "service_a"） |
| business_name | VARCHAR(100) | NOT NULL | 事業名 |
| business_description | TEXT | | 事業説明 |
| business_config | JSONB | DEFAULT '{}' | 事業固有設定（案件フィールド定義等） |
| business_project_prefix | VARCHAR(10) | UNIQUE, NOT NULL | 案件番号プレフィックス（例: "MG", "SA"） |
| business_is_active | BOOLEAN | DEFAULT true | 有効フラグ |
| business_sort_order | INTEGER | DEFAULT 0 | 表示順 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 作成日時 |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | 更新日時 |
| created_by | INTEGER | FK → users.id | 作成者 |
| updated_by | INTEGER | FK → users.id | 更新者 |

**business_config の構造例:**
```json
{
  "projectFields": {
    "custom_field_1": {
      "label": "機械型番",
      "type": "text",
      "required": true
    },
    "custom_field_2": {
      "label": "台数",
      "type": "number",
      "required": false
    }
  },
  "customerFields": {
    "custom_field_1": {
      "label": "設備規模",
      "type": "select",
      "options": ["小規模", "中規模", "大規模"],
      "required": false
    }
  },
  "partnerFields": {
    "custom_field_1": {
      "label": "認定ランク",
      "type": "select",
      "options": ["ゴールド", "シルバー", "ブロンズ"],
      "required": false
    }
  },
  "revenueRecognition": {
    "triggerStatus": "purchased",
    "amountField": "project_amount",
    "dateField": "project_actual_close_date",
    "description": "購入済みステータスの案件金額を計上"
  },
  "settings": {
    "enableGanttChart": true,
    "enableMonthlyReport": true
  }
}
```

#### users（ユーザーマスタ）

| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | SERIAL | PK | ユーザーID |
| user_email | VARCHAR(255) | UNIQUE, NOT NULL | メールアドレス |
| user_password_hash | VARCHAR(255) | NOT NULL | パスワードハッシュ |
| user_name | VARCHAR(100) | NOT NULL | ユーザー名 |
| user_role | VARCHAR(20) | NOT NULL | ロール（admin/staff/partner_admin/partner_staff） |
| user_partner_id | INTEGER | FK → partners.id, NULL | 代理店ユーザーの場合の代理店ID |
| user_is_active | BOOLEAN | DEFAULT true | 有効フラグ |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |
| created_by | INTEGER | FK → users.id | |
| updated_by | INTEGER | FK → users.id | |

#### user_business_assignments（ユーザー×事業 割り当て）

| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | SERIAL | PK | |
| user_id | INTEGER | FK → users.id, NOT NULL | |
| business_id | INTEGER | FK → businesses.id, NOT NULL | |
| assignment_role | VARCHAR(20) | DEFAULT 'member' | 事業内での役割 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

**UNIQUE制約**: (user_id, business_id)

#### industries（業種マスタ）

| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | SERIAL | PK | 業種ID |
| industry_name | VARCHAR(100) | UNIQUE, NOT NULL | 業種名 |
| display_order | INTEGER | DEFAULT 0 | 表示順 |
| is_active | BOOLEAN | DEFAULT true | 有効フラグ |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |

#### customers（顧客マスタ）

| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | SERIAL | PK | 顧客ID |
| customer_code | VARCHAR(20) | UNIQUE, NOT NULL | 顧客コード（自動採番: CST-0001） |
| customer_name | VARCHAR(200) | NOT NULL | 顧客名（会社名） |
| customer_salutation | VARCHAR(100) | | 呼称（社内での呼び名・通称） |
| customer_type | VARCHAR(20) | NOT NULL, DEFAULT '未設定' | 種別（法人/個人事業主/個人/確認中/未設定） |
| customer_postal_code | VARCHAR(10) | | 郵便番号 |
| customer_address | TEXT | | 住所 |
| customer_phone | VARCHAR(20) | | 電話番号 |
| customer_fax | VARCHAR(20) | | FAX番号 |
| customer_email | VARCHAR(255) | | メールアドレス |
| customer_website | VARCHAR(500) | | Webサイト |
| industry_id | INTEGER | FK → industries.id | 業種（業種マスタ参照） |
| customer_corporate_number | VARCHAR(13) | | 法人番号（13桁） |
| customer_invoice_number | VARCHAR(14) | | インボイス番号（T+13桁） |
| customer_capital | BIGINT | | 資本金 |
| customer_established_date | DATE | | 設立年月日 |
| customer_folder_url | VARCHAR(500) | | 顧客フォルダURL |
| customer_notes | TEXT | | 備考 |
| customer_is_active | BOOLEAN | DEFAULT true | 有効フラグ |
| version | INTEGER | DEFAULT 1, NOT NULL | 楽観的ロック用バージョン番号 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |
| created_by | INTEGER | FK → users.id | |
| updated_by | INTEGER | FK → users.id | |

#### customer_contacts（顧客担当者）

| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | SERIAL | PK | |
| customer_id | INTEGER | FK → customers.id, NOT NULL | 顧客ID |
| contact_name | VARCHAR(100) | NOT NULL | 担当者名 |
| contact_department | VARCHAR(100) | | 部署 |
| contact_position | VARCHAR(100) | | 役職 |
| contact_is_representative | BOOLEAN | DEFAULT false | 代表者フラグ |
| contact_phone | VARCHAR(20) | | 電話番号 |
| contact_fax | VARCHAR(20) | | FAX番号 |
| contact_email | VARCHAR(255) | | メールアドレス |
| contact_business_card_front_url | VARCHAR(500) | | 名刺画像URL（表） |
| contact_business_card_back_url | VARCHAR(500) | | 名刺画像URL（裏） |
| contact_is_primary | BOOLEAN | DEFAULT false | 主担当フラグ |
| contact_sort_order | INTEGER | DEFAULT 0 | 表示順 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |

#### customer_contact_business_links（担当者×事業リンク）

| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | SERIAL | PK | |
| contact_id | INTEGER | FK → customer_contacts.id, NOT NULL | 担当者ID |
| business_id | INTEGER | FK → businesses.id, NOT NULL | 事業ID |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

**UNIQUE制約**: (contact_id, business_id)

**担当者と事業の紐付け:**
- 1担当者が複数事業を担当可能（中間テーブル方式）
- 代表者は `contact_is_representative = true` で識別
- 名刺画像は表・裏のURL（画像ファイルのみ）を担当者に紐付けて格納
- 案件作成時、該当事業の担当者を優先表示し、なければ紐付けなし担当者をフォールバック

#### partners（代理店マスタ）

| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | SERIAL | PK | 代理店ID |
| partner_code | VARCHAR(20) | UNIQUE, NOT NULL | 代理店コード |
| partner_name | VARCHAR(200) | NOT NULL | 代理店名 |
| partner_parent_id | INTEGER | FK → partners.id, NULL | 親代理店ID（全社マスタ階層: 紹介関係の親子） |
| partner_hierarchy | VARCHAR(20) | DEFAULT '1次代理店' | 全社マスタ階層レベル（紹介関係の親子。事業内階層とは独立） |
| partner_postal_code | VARCHAR(10) | | 郵便番号 |
| partner_address | TEXT | | 住所 |
| partner_phone | VARCHAR(20) | | 電話番号 |
| partner_email | VARCHAR(255) | | メールアドレス |
| partner_website | VARCHAR(500) | | Webサイト |
| partner_contract_start_date | DATE | | 契約開始日 |
| partner_contract_end_date | DATE | | 契約終了日 |
| partner_notes | TEXT | | 備考 |
| partner_is_active | BOOLEAN | DEFAULT true | 有効フラグ |
| version | INTEGER | DEFAULT 1, NOT NULL | 楽観的ロック用バージョン番号 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |
| created_by | INTEGER | FK → users.id | |
| updated_by | INTEGER | FK → users.id | |

#### partner_contacts（代理店担当者）

| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | SERIAL | PK | |
| partner_id | INTEGER | FK → partners.id, NOT NULL | 代理店ID |
| contact_name | VARCHAR(100) | NOT NULL | 担当者名 |
| contact_department | VARCHAR(100) | | 部署 |
| contact_position | VARCHAR(100) | | 役職 |
| contact_phone | VARCHAR(20) | | 電話番号 |
| contact_email | VARCHAR(255) | | メールアドレス |
| contact_is_primary | BOOLEAN | DEFAULT false | 主担当フラグ |
| contact_sort_order | INTEGER | DEFAULT 0 | 表示順 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |

#### customer_business_links（顧客×事業リンク）

| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | SERIAL | PK | |
| customer_id | INTEGER | FK → customers.id, NOT NULL | 顧客ID |
| business_id | INTEGER | FK → businesses.id, NOT NULL | 事業ID |
| link_status | VARCHAR(20) | DEFAULT 'active' | リンク状態 |
| link_custom_data | JSONB | DEFAULT '{}' | 事業固有の顧客情報（business_config.customerFieldsに準拠） |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |

**UNIQUE制約**: (customer_id, business_id)

**link_custom_data の例（MOAG事業）:**
```json
{
  "equipment_scale": "大規模",
  "factory_count": 3
}
```

#### partner_business_links（代理店×事業リンク）

| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | SERIAL | PK | |
| partner_id | INTEGER | FK → partners.id, NOT NULL | 代理店ID |
| business_id | INTEGER | FK → businesses.id, NOT NULL | 事業ID |
| link_status | VARCHAR(20) | DEFAULT 'active' | リンク状態 |
| link_hierarchy_level | VARCHAR(20) | | 事業内階層（例: "1", "1-2"）。報酬管理・表示用 |
| link_commission_rate | DECIMAL(5,2) | | 事業内の手数料率（全社マスタの手数料率を上書き） |
| link_display_order | INTEGER | DEFAULT 0 | 事業内の表示順 |
| link_start_date | DATE | | 開始日 |
| link_end_date | DATE | | 終了日 |
| link_custom_data | JSONB | DEFAULT '{}' | 事業固有の代理店情報 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |

**UNIQUE制約**: (partner_id, business_id)

**代理店階層の2種類管理:**
- **全社マスタ階層**（`partners.partner_parent_id`）: 紹介関係の親子を管理。全事業共通。
- **事業内階層**（`partner_business_links.link_hierarchy_level`）: 報酬管理・表示用の階層。事業ごとに独立。
- マスタ上の親子関係と事業内の1次店/2次店は一致しなくてよい（要件として許容）。

**link_hierarchy_level の例:**
- `"1"` → 1次店（直接契約）
- `"1-2"` → 1次店の2次店
- `"2"` → 2次店（別系統）

---

### 2.2 事業レベル

#### business_status_definitions（営業ステータス定義）

| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | SERIAL | PK | |
| business_id | INTEGER | FK → businesses.id, NOT NULL | 事業ID |
| status_code | VARCHAR(50) | NOT NULL | ステータスコード |
| status_label | VARCHAR(100) | NOT NULL | 表示ラベル（例: "1.購入済み"） |
| status_priority | INTEGER | NOT NULL | 優先度（大きいほど高い） |
| status_color | VARCHAR(20) | | 表示色 |
| status_is_final | BOOLEAN | DEFAULT false | 最終ステータスか |
| status_is_lost | BOOLEAN | DEFAULT false | 失注ステータスか |
| status_sort_order | INTEGER | DEFAULT 0 | 表示順 |
| status_is_active | BOOLEAN | DEFAULT true | 有効フラグ |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |

**UNIQUE制約**: (business_id, status_code)

#### movement_templates（ムーブメントテンプレート）

| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | SERIAL | PK | |
| business_id | INTEGER | FK → businesses.id, NOT NULL | 事業ID |
| step_number | INTEGER | NOT NULL | ステップ番号 |
| step_code | VARCHAR(50) | NOT NULL | ステップコード |
| step_name | VARCHAR(100) | NOT NULL | ステップ名 |
| step_description | TEXT | | ステップ説明 |
| step_is_sales_linked | BOOLEAN | DEFAULT false | 営業ステータス連動か |
| step_linked_status_code | VARCHAR(50) | | 連動するステータスコード |
| step_config | JSONB | DEFAULT '{}' | ステップ固有設定 |
| step_is_active | BOOLEAN | DEFAULT true | 有効フラグ |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |

**UNIQUE制約**: (business_id, step_number)

#### projects（案件）

| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | SERIAL | PK | 案件ID |
| business_id | INTEGER | FK → businesses.id, NOT NULL | 事業ID |
| customer_id | INTEGER | FK → customers.id, NOT NULL | 顧客ID |
| partner_id | INTEGER | FK → partners.id | 代理店ID |
| project_no | VARCHAR(30) | UNIQUE, NOT NULL | 案件番号（事業プレフィックス + 連番） |
| project_name | VARCHAR(200) | | 案件名 |
| project_sales_status | VARCHAR(50) | NOT NULL | 営業ステータス |
| project_assigned_user_id | INTEGER | FK → users.id | 担当ユーザー（アクセス制御用） |
| project_assigned_user_name | VARCHAR(100) | | 担当者名（自由記入） |
| project_amount | BIGINT | DEFAULT 0 | 案件金額 |
| project_expected_close_date | DATE | | 受注予定日 |
| project_actual_close_date | DATE | | 実際の受注日 |
| project_notes | TEXT | | 備考 |
| project_custom_data | JSONB | DEFAULT '{}' | 事業固有フィールドデータ |
| project_status_changed_at | TIMESTAMPTZ | | 営業ステータス最終変更日時 |
| project_is_active | BOOLEAN | DEFAULT true | 有効フラグ |
| version | INTEGER | DEFAULT 1, NOT NULL | 楽観的ロック用バージョン番号 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |
| created_by | INTEGER | FK → users.id | |
| updated_by | INTEGER | FK → users.id | |

**project_custom_data の例（MOAG事業）:**
```json
{
  "machine_model": "MOG-2000",
  "total_machine_count": 3,
  "installation_location": "東京都渋谷区...",
  "lease_company": "リース会社A",
  "subsidy_type": "ものづくり補助金"
}
```

#### project_movements（案件ムーブメント進捗）

| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | SERIAL | PK | |
| project_id | INTEGER | FK → projects.id, NOT NULL | 案件ID |
| template_id | INTEGER | FK → movement_templates.id, NOT NULL | テンプレートID |
| movement_status | VARCHAR(20) | DEFAULT 'pending' | 進捗状態（pending/in_progress/completed/skipped） |
| movement_started_at | TIMESTAMPTZ | | 開始日時 |
| movement_completed_at | TIMESTAMPTZ | | 完了日時 |
| movement_notes | TEXT | | メモ |
| movement_data | JSONB | DEFAULT '{}' | ステップ固有データ |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_by | INTEGER | FK → users.id | |

**UNIQUE制約**: (project_id, template_id)

#### movement_logs（ムーブメントログ）

| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | SERIAL | PK | |
| project_movement_id | INTEGER | FK → project_movements.id, NOT NULL | |
| log_action | VARCHAR(50) | NOT NULL | アクション（status_changed, note_added等） |
| log_old_value | TEXT | | 変更前の値 |
| log_new_value | TEXT | | 変更後の値 |
| log_note | TEXT | | ログメモ |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| created_by | INTEGER | FK → users.id | |

#### project_files（案件ファイル）

| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | SERIAL | PK | |
| project_id | INTEGER | FK → projects.id, NOT NULL | 案件ID |
| file_name | VARCHAR(255) | NOT NULL | ファイル名 |
| file_path | VARCHAR(500) | NOT NULL | ファイルパス |
| file_size | INTEGER | | ファイルサイズ（バイト） |
| file_mime_type | VARCHAR(100) | | MIMEタイプ |
| file_category | VARCHAR(50) | | カテゴリ（contract, invoice等） |
| file_description | TEXT | | 説明 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| created_by | INTEGER | FK → users.id | |

#### monthly_reports（月次レポート）

| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | SERIAL | PK | |
| business_id | INTEGER | FK → businesses.id, NOT NULL | 事業ID |
| report_year | INTEGER | NOT NULL | 年 |
| report_month | INTEGER | NOT NULL | 月 |
| report_target_amount | BIGINT | DEFAULT 0 | 目標金額 |
| report_actual_amount | BIGINT | DEFAULT 0 | 実績金額 |
| report_project_count | INTEGER | DEFAULT 0 | 案件数 |
| report_won_count | INTEGER | DEFAULT 0 | 受注件数 |
| report_lost_count | INTEGER | DEFAULT 0 | 失注件数 |
| report_data | JSONB | DEFAULT '{}' | 追加データ |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |

**UNIQUE制約**: (business_id, report_year, report_month)

#### budget_targets（売上目標）

| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | SERIAL | PK | |
| business_id | INTEGER | FK → businesses.id, NOT NULL | 事業ID |
| target_year | INTEGER | NOT NULL | 年 |
| target_month | INTEGER | NOT NULL | 月（1-12） |
| target_type | VARCHAR(20) | NOT NULL | 目標種別（business/partner/user） |
| target_entity_id | INTEGER | NULL | 対象ID（partner_id or user_id。business全体の場合はNULL） |
| target_amount | BIGINT | NOT NULL | 目標金額 |
| target_notes | TEXT | | 備考 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |
| created_by | INTEGER | FK → users.id | |
| updated_by | INTEGER | FK → users.id | |

**UNIQUE制約**: (business_id, target_year, target_month, target_type, target_entity_id)

**target_type の値:**
- `"business"` - 事業全体の目標（target_entity_id = NULL）
- `"partner"` - 代理店別目標（target_entity_id = partner_id）
- `"user"` - 担当者別目標（target_entity_id = user_id）

---

### 2.3 共通機能

#### notifications（通知）

| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | SERIAL | PK | |
| notification_user_id | INTEGER | FK → users.id, NOT NULL | 通知先ユーザー |
| notification_type | VARCHAR(50) | NOT NULL | 通知種別 |
| notification_title | VARCHAR(200) | NOT NULL | 通知タイトル |
| notification_message | TEXT | | 通知本文 |
| notification_link | VARCHAR(500) | | 遷移先リンク |
| notification_is_read | BOOLEAN | DEFAULT false | 既読フラグ |
| notification_read_at | TIMESTAMPTZ | | 既読日時 |
| notification_data | JSONB | DEFAULT '{}' | 追加データ |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

**notification_type の値:**
- `"status_changed"` - 案件ステータス変更
- `"due_date_exceeded"` - 受注予定日超過
- `"movement_stalled"` - ムーブメント停滞
- `"csv_import_completed"` - CSVインポート完了
- `"csv_import_error"` - CSVインポートエラー
- `"system"` - システム通知

#### user_table_preferences（ユーザーテーブル設定）

| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | SERIAL | PK | |
| user_id | INTEGER | FK → users.id, NOT NULL | ユーザーID |
| table_key | VARCHAR(100) | NOT NULL | テーブル識別キー（例: "customer-list"） |
| settings | JSONB | NOT NULL | 列設定（JSON） |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |

**UNIQUE制約**: (user_id, table_key)

**settings の構造:**
```json
{
  "columnOrder": ["customerCode", "customerName", ...],
  "columnVisibility": { "customerCode": true, "customerFax": false, ... },
  "columnWidths": { "customerCode": 120, "customerName": 200, ... },
  "sortState": [{ "field": "customerCode", "direction": "asc" }],
  "columnPinning": { "left": ["customerName"] }
}
```

#### user_table_views（テーブルビュー — 名前付き表示条件の保存）

ユーザーがテーブルの表示状態（表示列・ソート・絞り込み・ページサイズ）を名前付きで複数パターン保存し、切り替えて使える機能。
共通コンポーネントとして全一覧画面（顧客・代理店等）で共有する。

| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | SERIAL | PK | |
| user_id | INTEGER | FK → users.id, NOT NULL | ユーザーID |
| table_key | VARCHAR(100) | NOT NULL | テーブル識別キー（例: "customer-list"） |
| view_name | VARCHAR(100) | NOT NULL | ビュー名（例: "営業用"、"経理用"） |
| is_default | BOOLEAN | DEFAULT false | デフォルトビューか |
| config | JSONB | NOT NULL | ビュー設定（JSON） |
| display_order | INTEGER | DEFAULT 0 | 表示順 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |

**UNIQUE制約**: (user_id, table_key, view_name)

**config の構造:**
```json
{
  "columnOrder": ["customerCode", "customerName", ...],
  "columnVisibility": { "customerCode": true, "customerFax": false, ... },
  "columnWidths": { "customerCode": 120, "customerName": 200, ... },
  "sortState": [{ "field": "customerCode", "direction": "asc" }],
  "columnPinning": { "left": ["customerName"] },
  "filters": { "customerType": "法人", "industryId": "3" },
  "pageSize": 25
}
```

**備考:**
- `user_table_preferences`（既存）は現在のテーブル状態の自動保存用（1テーブル1設定）
- `user_table_views`（本テーブル）はユーザーが名前をつけて明示的に保存する複数ビュー用
- 実装時に `user_table_preferences` を `user_table_views` に統合するか、併存させるかは Phase 1.5 で判断

#### audit_logs（監査ログ）

| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | SERIAL | PK | |
| audit_table_name | VARCHAR(50) | NOT NULL | 対象テーブル名 |
| audit_record_id | INTEGER | NOT NULL | 対象レコードID |
| audit_action | VARCHAR(20) | NOT NULL | 操作種別（INSERT/UPDATE/DELETE） |
| audit_changed_fields | JSONB | | 変更フィールド（{field: {old, new}}形式） |
| audit_ip_address | VARCHAR(45) | | 操作元IPアドレス |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 操作日時 |
| created_by | INTEGER | FK → users.id | 操作者 |

**対象テーブル:**
主要マスタ（customers, partners, projects, project_movements）の変更を自動記録。
Prismaのmiddlewareで自動的にログを挿入する。

---

## 3. 命名規則まとめ

### 3.1 テーブル命名

| ルール | 例 |
|-------|---|
| 複数形、snake_case | `customers`, `partners`, `projects` |
| リンクテーブルは `<A>_<B>_links` | `customer_business_links`, `partner_business_links` |
| 子テーブルは親のプレフィックス | `customer_contacts`, `partner_contacts` |
| ログテーブルは `<対象>_logs` | `movement_logs` |
| 監査ログは `audit_logs` | `audit_logs` |
| 定義テーブルは `<対象>_definitions` | `business_status_definitions` |

### 3.2 カラム命名

| ルール | 例 |
|-------|---|
| テーブルプレフィックス付き | `customer_name`, `partner_code`, `project_no` |
| 外部キーは `<参照先単数>_id` | `customer_id`, `business_id` |
| ステータスは `<prefix>_status` | `project_sales_status`, `movement_status` |
| 日時は `<prefix>_at` | `movement_started_at`, `movement_completed_at` |
| 真偽値は `<prefix>_is_<状態>` | `business_is_active`, `step_is_sales_linked` |
| JSON型は `<prefix>_data` or `<prefix>_config` | `project_custom_data`, `business_config` |
| 監査4フィールドはプレフィックスなし | `created_at`, `updated_at`, `created_by`, `updated_by` |
| 楽観的ロックは `version` (プレフィックスなし) | `version`（主要マスタ: customers, partners, projects） |
| 採番コードは `<prefix>_code` 形式で自動生成 | `customer_code` (CST-0001), `partner_code` (AG-0001) |

### 3.3 禁止事項（現システムの教訓）

- 同じ意味のカラムに異なる名前を使わない（`sales_status` と `project_sales_status` の混在を禁止）
- 略語と正式名称を混ぜない（`mo_` は使わない、`customer_` に統一）
- 子テーブルの担当者カラムには共通の `contact_` プレフィックスを使用
- 監査フィールドは全テーブルに必ず含める

---

## 4. インデックス設計

### 必須インデックス

```sql
-- 外部キー（全テーブル共通）
CREATE INDEX idx_projects_business_id ON projects(business_id);
CREATE INDEX idx_projects_customer_id ON projects(customer_id);
CREATE INDEX idx_projects_partner_id ON projects(partner_id);
CREATE INDEX idx_projects_assigned_user_id ON projects(project_assigned_user_id);

-- 検索用
CREATE INDEX idx_customers_name ON customers(customer_name);
CREATE INDEX idx_partners_name ON partners(partner_name);
CREATE INDEX idx_projects_sales_status ON projects(project_sales_status);
CREATE INDEX idx_projects_no ON projects(project_no);

-- 複合インデックス
CREATE INDEX idx_projects_business_status ON projects(business_id, project_sales_status);
CREATE INDEX idx_projects_status_changed ON projects(project_status_changed_at DESC);
CREATE INDEX idx_monthly_reports_period ON monthly_reports(business_id, report_year, report_month);

-- 予実管理
CREATE INDEX idx_budget_targets_business ON budget_targets(business_id, target_year, target_month);
CREATE INDEX idx_budget_targets_type ON budget_targets(target_type, target_entity_id);

-- 通知
CREATE INDEX idx_notifications_user ON notifications(notification_user_id, notification_is_read);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- 顧客×事業リンク
CREATE INDEX idx_customer_business_links_customer ON customer_business_links(customer_id);
CREATE INDEX idx_customer_business_links_business ON customer_business_links(business_id);

-- 顧客担当者×事業リンク
CREATE INDEX idx_contact_business_links_business ON customer_contact_business_links(business_id);
-- UNIQUE制約: (contact_id, business_id) はテーブル定義で指定済み

-- 代理店×事業リンク（拡張）
CREATE INDEX idx_partner_business_links_partner ON partner_business_links(partner_id);
CREATE INDEX idx_partner_business_links_business ON partner_business_links(business_id);
CREATE INDEX idx_partner_business_links_hierarchy ON partner_business_links(business_id, link_hierarchy_level);

-- ユーザーテーブル設定
CREATE INDEX idx_user_table_preferences_user ON user_table_preferences(user_id);

-- テーブルビュー
CREATE INDEX idx_user_table_views_user_table ON user_table_views(user_id, table_key);

-- 監査ログ
CREATE INDEX idx_audit_logs_table_record ON audit_logs(audit_table_name, audit_record_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_user ON audit_logs(created_by);

-- JSONB（GINインデックス）
CREATE INDEX idx_projects_custom_data ON projects USING GIN(project_custom_data);
CREATE INDEX idx_business_config ON businesses USING GIN(business_config);
CREATE INDEX idx_customer_business_links_custom ON customer_business_links USING GIN(link_custom_data);
```

---

## 5. 楽観的ロック（Optimistic Locking）

### 5.1 概要

複数ユーザーが同時に同じレコードを編集した際のデータ損失を防ぐ。
主要マスタテーブル（`customers`, `partners`, `projects`）に `version` カラムを持ち、更新時にバージョンチェックを行う。

### 5.2 動作フロー

```
1. クライアントがレコード取得 → { id: 1, customerName: "A社", version: 3 }
2. ユーザーAが編集開始（version: 3を保持）
3. ユーザーBが同じレコードを編集・保存 → version: 3→4に更新
4. ユーザーAが保存実行 → UPDATE ... WHERE id = 1 AND version = 3
5. version不一致（現在4） → 409 Conflict レスポンス
6. クライアントが競合解決UIを表示
```

### 5.3 実装方針

**サーバー側（Prisma middleware）:**
```typescript
// UPDATE時に自動的にversionチェック＋インクリメント
prisma.$use(async (params, next) => {
  if (params.action === 'update' && VERSIONED_MODELS.includes(params.model)) {
    const { version, ...data } = params.args.data;
    params.args.where = { ...params.args.where, version };
    params.args.data = { ...data, version: { increment: 1 } };
    const result = await next(params);
    if (!result) throw new ConflictError('レコードが他のユーザーにより更新されました');
    return result;
  }
  return next(params);
});
```

**APIレスポンス（409 Conflict）:**
```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "このレコードは他のユーザーにより更新されました。最新データを確認してください。",
    "details": {
      "currentVersion": 4,
      "yourVersion": 3
    }
  }
}
```

**対象テーブル:** `customers`, `partners`, `projects`
**非対象:** 子テーブル（contacts等）、ログ系テーブル、設定テーブル

---

## 6. 論理削除ポリシー（Soft Delete）

### 6.1 概要

`is_active = false` による論理削除の動作ルールを明確に定義する。

### 6.2 テーブル別の論理削除ルール

| テーブル | 論理削除カラム | 子データの扱い | 参照先の扱い |
|---------|-------------|-------------|------------|
| `businesses` | `business_is_active` | 無効化のみ（案件・テンプレートは残る） | 事業選択肢から除外 |
| `customers` | `customer_is_active` | 担当者・事業リンクはそのまま | 新規案件作成時に選択不可。既存案件はそのまま |
| `partners` | `partner_is_active` | 担当者・事業リンクはそのまま | 新規案件作成時に選択不可。既存案件はそのまま |
| `projects` | `project_is_active` | ムーブメント・ファイルはそのまま | 一覧にデフォルト非表示（フィルターで表示可能） |
| `users` | `user_is_active` | — | ログイン不可。担当案件はそのまま表示 |

### 6.3 共通ルール

1. **論理削除されたレコードは一覧のデフォルト表示から除外** — フィルターで「無効を含む」を選択すると表示可能
2. **論理削除されたレコードの詳細画面は閲覧可能** — 「無効」のバナーを画面上部に表示
3. **論理削除されたレコードは編集不可** — 復元（`is_active = true`に戻す）のみ許可
4. **論理削除時に子レコードは連鎖削除しない** — 紐づきはそのまま保持
5. **外部キー参照先が無効化されても既存データは壊さない** — 新規作成時の選択肢から除外するのみ
6. **物理削除は行わない** — 管理画面からの削除操作は全て論理削除

### 6.4 API動作

```
GET  /api/v1/customers              → is_active=true のみ（デフォルト）
GET  /api/v1/customers?includeInactive=true → 全件
DELETE /api/v1/customers/:id        → is_active=false に更新（物理削除しない）
PATCH /api/v1/customers/:id/restore → is_active=true に復元
```
