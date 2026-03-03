# 現システムからの引き継ぎ仕様書

**作成日**: 2026-02-16
**対象**: MOAG管理システム → 統合管理システム
**目的**: 既存システムの仕様のうち、新システムに引き継ぐ機能とその一般化方針を記録する

---

## 1. 概要

本ドキュメントは、既存MOAG管理システム（React 18 + Express + PostgreSQL）から新・統合管理システム（Next.js 14 + Prisma + PostgreSQL）への移行にあたり、引き継ぐべき業務仕様とその一般化方針を定義する。

既存システムは単一事業（MOAG事業）に特化して構築されているが、業務フロー自体は汎用性が高い。新システムでは事業固有の概念をテーブル定義やJSON設定に外出しすることで、コード変更なしに事業を追加できるアーキテクチャを実現する。

### 引き継ぎの基本方針

| 方針 | 説明 |
|------|------|
| **業務ロジックの保存** | 現行の営業ステータス遷移制御、ムーブメント連動などの業務ルールはそのまま引き継ぐ |
| **設定ベースへの一般化** | ハードコードされたステータス値やステップ定義をテーブル/JSON設定に外出しする |
| **命名の統一** | MO/MOAGなどの事業固有用語をcustomer/partnerなどの汎用名に変更する |
| **共通コンポーネント化** | エンティティ固有のフック・コンポーネントを汎用テンプレートに統一する |

---

## 2. 営業ステータス

### 2.1 現行仕様

以下の7段階のステータスが存在する（優先度順）。

| 表示名 | 優先度 | 種別 | 説明 |
|--------|--------|------|------|
| "1.購入済み" | 6 | 最終ステータス | 受注完了 |
| "2.入金確定" | 5 | 通常 | 入金が確認された状態 |
| "3.契約締結中" | 4 | 通常 | 契約手続き中 |
| "4.Aヨミ(申請中)" | 3 | 通常 | 高確度案件 |
| "5.Bヨミ" | 2 | 通常 | 中確度案件 |
| "6.アポ中" | 1 | 通常 | 初期段階 |
| "7.失注" | 0 | 失注ステータス | 商談が失注した状態 |

**ステータス更新ルール**（`salesStatusConfig.js`にて実装）:

- より高い優先度のステータスへの変更のみ許可する（逆行禁止）
- "7.失注" は任意の状態から遷移可能（優先度0として特殊扱い）
- ステータス比較は `getHigherPriorityStatus()` 関数で行い、数値優先度の大小で判定する
- 更新前に `getHigherPriorityStatuses()` で許可されたステータス一覧を取得し、その中に含まれる場合のみ更新を実行する

**ステータス連動**:

- ムーブメントのステップ1（営業ステータス）は `is_sales_linked = true` に設定されている
- ステップ1のステータスが変更されると、対応する下位ステップが自動的にスキップされる
  - "6.アポ中" → ステップ1を完了
  - "5.Bヨミ" → ステップ2まで自動スキップ
  - "4.Aヨミ(申請中)" → ステップ3まで自動スキップ

**購入済みステータスのMO台数再計算**:

- 営業ステータスが "1.購入済み" に変更された場合、または "1.購入済み" から他のステータスに変更された場合、関連するMO（顧客）の合計台数を再計算する
- 再計算は `moCalculationService.updateMoTotalMachineCount()` で実行される

### 2.2 新システムでの一般化

- `business_status_definitions` テーブルで事業ごとにステータスを定義する
- 優先度ベースの遷移制御は共通ロジックとして実装する
- 1事業目（MOAG事業）のステータスは現行の7段階をそのまま初期データとして投入する
- 事業追加時はその事業独自のステータスを定義可能にする
- `status_is_final` フラグで最終ステータスを識別する
- `status_is_lost` フラグで失注ステータスを識別する（任意の状態からの遷移を許可）
- ステータス変更時の連動処理（台数再計算など）は `business_config` の `hooks` 設定で事業ごとに定義する

---

## 3. ムーブメント（18ステップ）

### 3.1 現行仕様

案件の進捗を18のステップで管理する。テンプレートは `project_movement_templates` テーブルに定義されている。

| ステップ | step_code | step_name | ステータス連動 |
|---------|-----------|-----------|--------------|
| 1 | sales_status_display | 営業ステータス | is_sales_linked = true |
| 2 | location_sharing | 設置場所共有 | - |
| 3 | property_contract | 動産契約 | - |
| 4 | industrial_association_application | 工業会申請 | - |
| 5 | industrial_association_approval | 工業会承認 | - |
| 6 | sme_agency_application | 中企庁申請 | - |
| 7 | sme_agency_approval | 中企庁承認 | - |
| 8 | contract_preparation | 契約書作成 | - |
| 9 | contract_legal_check | 法務チェック | - |
| 10 | contract_signing | 契約締結 | - |
| 11 | invoice_issuance | 請求書発行 | - |
| 12 | payment_confirmation | 入金確認 | - |
| 13 | delivery_preparation | 納品準備 | - |
| 14 | delivery_execution | 納品実行 | - |
| 15 | installation_report | 設置報告 | - |
| 16 | ext_care_contract | 拡張ケア契約 | - |
| 17 | receipt_issuance | 領収書発行 | - |
| 18 | completion | 完了 | - |

**ムーブメントの状態遷移**:

各ムーブメントは以下の4状態を持つ。

| 状態 | 説明 |
|------|------|
| `pending` | 未着手（初期状態） |
| `in_progress` | 進行中（`started_at` が自動設定される） |
| `completed` | 完了（`completed_at` が自動設定される） |
| `skipped` | スキップ（`skip_reason` を記録。`completed_at` が自動設定される） |

**ステータス連動ルール**（`Movement.updateMovementStatus()` にて実装）:

1. ステップ1（`is_sales_linked = true`）の営業ステータスが変更される
2. 現在の営業ステータスより高い優先度のステータスへの変更のみ許可する
3. 新しいステータスに対して `getLowerPrioritySteps()` を呼び出し、スキップ対象のステップ番号を取得する
4. 対象ステップの `status` が `pending` または `in_progress` の場合、`skipped` に変更し、`skip_reason` に "営業ステータス更新により自動スキップ" を設定する

**ロールバック**:

- ムーブメントのステータスを `pending` に戻すロールバック機能がある
- ロールバック時は `started_at`, `completed_at`, `sub_status`, `skip_reason` をすべてNULLにリセットする
- ロールバックの理由を `movement_logs` に記録する

**ムーブメントログ**:

`movement_logs` テーブルに以下を記録する。
- `action_type`: "started", "rollback" 等
- `previous_value`: 変更前のステータス
- `new_value`: 変更後のステータス
- `comment`: 備考
- `changed_by_user_id`: 変更者ID

**案件作成時の自動生成**:

案件が新規作成されると、アクティブなテンプレート（`is_active = true`）のすべてのステップに対して、`status = 'pending'` のムーブメントレコードが自動生成される。

### 3.2 新システムでの一般化

- `movement_templates` テーブルで事業ごとにステップを定義する（`business_id` カラムを追加）
- ステップ数は事業ごとに自由（8ステップでも25ステップでも可）
- ステータス連動は `step_config` のJSONでルールを定義する
- 連動ルールの一般形:

```json
{
  "salesLinked": true,
  "autoSkipRules": [
    {
      "statusCode": "appointment",
      "skipUpToStep": 1
    },
    {
      "statusCode": "b_prospect",
      "skipUpToStep": 2
    },
    {
      "statusCode": "a_prospect",
      "skipUpToStep": 3
    }
  ]
}
```

- 1事業目（MOAG事業）のテンプレートは現行の18ステップをそのまま初期データとして投入する
- ロールバック機能と変更ログ記録は共通ロジックとして維持する

---

## 4. 案件管理

### 4.1 案件番号の採番ルール

**現行**:

- 形式: `{mo_no}-{連番}` （例: `MO-001-3`）
- MO番号（`mo_no`）を取得し、そのMOに紐づく案件の最大 `project_sequence` に1を加算して連番を生成する
- `project_no` は読み取り専用（手動変更不可）
- `project_sequence` は `sales_projects` テーブルに保持する

**新システム**:

- 形式: `{事業プレフィックス}-{顧客コード}-{連番}` （例: `MG-C001-003`）
- 事業プレフィックスは `businesses.business_project_prefix` から取得する
- 自動採番、手動変更不可（読み取り専用）

### 4.2 案件の共通フィールド

以下は全事業で共通のフィールドとして `projects` テーブルに定義する。

| カテゴリ | フィールド | 現行カラム名 | 新カラム名 |
|----------|-----------|-------------|-----------|
| 基本情報 | 案件番号 | `project_no` | `project_no` |
| 基本情報 | 案件名 | (MOニックネームで代用) | `project_name` |
| 基本情報 | 顧客 | `mo_id` | `customer_id` |
| 基本情報 | 代理店 | `moag_id` | `partner_id` |
| ステータス | 営業ステータス | `project_sales_status` | `project_sales_status` |
| ステータス | 進捗 | `project_progress` | (ムーブメントから自動計算) |
| 担当 | 担当者名 | `sales_rep_id` | `project_assigned_user_name`（自由記入）+ `project_assigned_user_id`（アクセス制御用FK） |
| 金額 | 案件金額 | `total_machine_amount` | `project_amount` |
| 日付 | 受注予定日 | `expected_purchase_month` | `project_expected_close_date` |
| 日付 | 実際の受注日 | `payment_received_date` | `project_actual_close_date` |
| その他 | 失注理由 | `lost_reason` | (project_custom_dataに格納) |
| その他 | 備考 | `project_notes` | `project_notes` |
| 監査 | 作成日時 | `created_at` | `created_at` |
| 監査 | 更新日時 | `updated_at` | `updated_at` |
| 監査 | 作成者 | `created_by` | `created_by` |
| 監査 | 更新者 | `updated_by` | `updated_by` |

### 4.3 事業固有フィールド（MOAG事業の例）

以下のフィールドはMOAG事業固有であり、`project_custom_data`（JSONB）に格納する。`business_config.projectFields` で定義する。

| フィールド | 現行カラム名 | custom_dataのキー | 型 |
|-----------|-------------|-------------------|-----|
| 一般機台数 | `general_machine_count` | `general_machine_count` | number |
| 一般機単価 | `general_machine_unit_price` | `general_machine_unit_price` | number |
| 一般機合計金額 | `general_machine_total_amount` | `general_machine_total_amount` | number |
| IC機台数 | `ic_machine_count` | `ic_machine_count` | number |
| IC機単価 | `ic_machine_unit_price` | `ic_machine_unit_price` | number |
| IC機合計金額 | `ic_machine_total_amount` | `ic_machine_total_amount` | number |
| 合計台数 | `total_machine_count` | `total_machine_count` | number |
| 目標ROI | `project_target_roi` | `target_roi` | number |
| 確認連絡先 | `project_confirmation_contact` | `confirmation_contact` | text |
| EXTケア加入 | `ext_care_subscription` | `ext_care_subscription` | boolean |
| EXTケア契約期間 | `ext_care_contract_period` | `ext_care_contract_period` | number |
| 装填金拠出 | `loading_fund_contribution` | `loading_fund_contribution` | boolean |
| 装填金額 | `loading_fund_amount` | `loading_fund_amount` | number |
| 装填金拠出者 | `loading_fund_contributor` | `loading_fund_contributor` | text |
| 装填金受託者 | `loading_fund_trustee` | `loading_fund_trustee` | text |
| 販売会社 | `mo_sales_company` | `sales_company` | text |
| 運営会社 | `mo_operating_company` | `operating_company` | text |
| JAOC営業担当 | `mo_jaoc_sales_contact` | `jaoc_sales_contact` | text |
| 外部営業担当 | `mo_ext_sales_contact` | `ext_sales_contact` | text |
| 工業会ステータス | `industrial_association_status` | `industrial_association_status` | select |
| 中企庁認定状況 | `sme_agency_certification_status` | `sme_agency_certification_status` | select |
| 設置場所共有状況 | `location_share_status` | `location_share_status` | text |
| 動産契約状況 | `property_contract_status` | `property_contract_status` | text |
| 売買契約日 | `sales_contract_date` | `sales_contract_date` | date |
| 共同運用契約日 | `joint_operation_contract_date` | `joint_operation_contract_date` | date |
| 前金支払日 | `advance_payment_date` | `advance_payment_date` | date |
| 拡張納品可能日 | `ext_delivery_available_date` | `ext_delivery_available_date` | date |
| 納品日 | `delivery_date` | `delivery_date` | date |
| 申請代行者名 | `application_agent_name` | `application_agent_name` | text |

他事業ではその事業に合ったフィールドを `business_config.projectFields` で定義する。

### 4.4 権限制御

現行の案件アクセス制御を引き継ぐ。

| ユーザーロール | アクセス範囲 | 新システムでの実装 |
|-------------|------------|---------|
| admin | 全案件 | フィルターなし |
| staff | 所属事業の全案件 | `user_business_assignments` でフィルター |
| partner_admin | 自社+下位代理店の関連事業の案件 | `partner_business_links` + `getSubPartnerIds()` で階層的に取得 |
| partner_staff | 自社+下位代理店の関連事業の案件（閲覧のみ） | 同上。編集不可 |

新システムでは `user_business_assignments` と `partner_business_links` を使い、事業レベルでのアクセス制御を追加する。

---

## 5. 顧客管理（現MO）

### 5.1 引き継ぐ機能

**基本情報管理**:

| 情報区分 | フィールド例 |
|---------|------------|
| 会社基本 | 会社名、愛称（ニックネーム）、業種、決算月 |
| 連絡先 | 電話番号、メールアドレス、コーポレートサイトURL |
| 住所 | 郵便番号、住所、郵送先住所 |
| 企業情報 | 設立日、資本金、従業員数、法人番号、インボイス番号 |
| 代表者 | 氏名、役職、電話番号、メール、名刺（表裏画像） |
| 口座情報 | 銀行名、支店名、支店コード、口座種別、口座番号、口座名義人 |
| ステータス | 反社チェックステータス（未チェック/実施中/問題なし/要確認） |
| 台数管理 | 基礎一般機台数、基礎IC機台数、合計台数（自動計算）、合計金額 |

**顧客担当者の複数登録**（`mo_contacts` テーブル、1対多の子テーブル）:

- 担当者ごとに氏名、カナ、メール、電話、役職、名刺（表裏画像）を管理する
- `display_order` で表示順を制御する
- `is_active` フラグで有効/無効を管理する
- 案件との紐づけは `sales_projects.mo_contact_id` で1つの担当者を参照する

**反社チェックステータス管理**:

取りうる値: "未チェック" / "実施中" / "問題なし" / "要確認"

**MO番号の自動採番**:

- `generate_mo_number()` PostgreSQL関数で自動生成（形式: `MO-001`）
- 既存の最大番号から連番を振る

**合計台数の自動計算**:

- `mo_total_machine_count` = 基礎台数 + 購入済み案件の台数
- 案件の営業ステータスが "1.購入済み" に変更された際に再計算される

**関連案件の一覧表示**:

- 顧客詳細画面から、その顧客に紐づく全案件を表示する
- `project_count` をサブクエリで取得する

### 5.2 新システムでの変更点

| 項目 | 現行 | 新システム |
|------|------|----------|
| テーブル名 | `mos` | `customers` |
| プレフィックス | `mo_` | `customer_` |
| コード | `mo_no` (例: `MO-001`) | `customer_code` (例: `CST-0001`) |
| 事業スコープ | 単一事業 | 事業横断（1顧客が複数事業に関わりうる） |
| 台数管理 | `mo_total_machine_count` 等 | 事業固有の情報は `projects.project_custom_data` に移動 |
| 口座情報 | `mo_bank_name` 等 | `customers` テーブルに保持（全事業共通情報） |

---

## 6. 代理店管理（現MOAG）

### 6.1 引き継ぐ機能

**基本情報管理**:

| 情報区分 | フィールド例 |
|---------|------------|
| 基本 | 代理店名、愛称（ニックネーム）、代理店番号、業種 |
| 全社マスタ階層 | 紹介関係の親子（`partner_parent_id`） |
| 事業内階層 | 報酬管理・表示用の階層（`partner_business_links.link_hierarchy_level`） |
| 連絡先 | 電話番号、メール、住所、郵送先住所、明細書送付先メール |
| 代表者 | 氏名、役職、電話番号、メール、名刺（表裏画像） |
| 口座情報 | 銀行名、支店名、支店コード、口座種別、口座番号、口座名義人 |
| ステータス | 反社チェックステータス、GOMI承認ステータス |
| 手数料 | 直接手数料率、間接手数料率、手数料負担 |
| 販売実績 | 総売上台数、総売上金額（自動計算） |

**代理店担当者の複数登録**（`moag_contacts` テーブル、1対多の子テーブル）:

- 担当者ごとに氏名、メール、電話、事前問合せメール、名刺（表裏画像）を管理する
- `display_order` で表示順を制御する
- `is_active` フラグで有効/無効を管理する

**階層構造**（親子代理店関係）:

- `moag_parent_id` で親代理店を参照する
- `moag_hierarchy` で階層レベルを管理する（"1次店" / "2次店" / "3次店"）
- `getSubAgencyIds()` で指定代理店の自社IDと全傘下代理店IDを再帰的に取得する
- 権限制御で代理店管理者は自社と傘下代理店のデータのみアクセス可能にする

**関連案件の一覧表示**:

- 代理店詳細画面から、その代理店に紐づく全案件を表示する

### 6.2 新システムでの変更点

| 項目 | 現行 | 新システム |
|------|------|----------|
| テーブル名 | `moags` | `partners` |
| プレフィックス | `moag_` | `partner_` |
| コード | `moag_no` (例: `AG001`) | `partner_code` (例: `AG-0001`。AG = agent由来) |
| 事業リンク | 暗黙的（MOAG事業のみ） | `partner_business_links` テーブルで明示的に管理 |
| 代理店ポータル | なし | 閲覧専用ポータルを追加（`/portal`） |
| GOMI承認ステータス | `moag_gomi_approval_status` | 事業固有の情報として再設計を検討 |

---

## 7. ユーザー管理と権限

### 7.1 現行のロール体系

| ロール | 説明 | 主な権限 |
|--------|------|---------|
| `admin` | 管理者 | 全操作。全データへのフルアクセス |
| `sales` | 営業担当 | 案件・顧客・代理店のCRUD。全データ閲覧 |
| `mo_clerk` | MO事務 | 案件・顧客・代理店のCRUD。全データ閲覧 |
| `agent_admin` | 代理店管理者 | 自社+傘下代理店のデータ閲覧・編集。ユーザー作成（外部ロールのみ） |
| `agent_staff` | 代理店スタッフ | 自社+傘下代理店のデータ閲覧・編集 |
| `application_agent` | 申請代行者 | 自分が担当する案件のみ閲覧・編集 |

**権限の具体的な制御**:

- `agent_admin` は外部ロール（`agent_admin`, `agent_staff`, `application_agent`）のユーザーのみ作成可能
- `agent_admin` は自社階層内のユーザーのみ表示される（子会社を含む）
- パスワード変更: 自分自身は現在のパスワードが必要、管理者は不要
- ユーザー削除は論理削除（`is_active = false`）

**CSV権限**:

ユーザーごとにCSV操作の権限を制御する（`permissions` JSONBカラム）。

```json
{
  "csv": {
    "export": true,
    "import": true,
    "download_template": true
  }
}
```

### 7.2 新システムでのロール対応

| 現行ロール | 新システムロール | 補足 |
|-----------|----------------|------|
| `admin` | `admin` | 変更なし。全事業・全データへのフルアクセス |
| `sales`, `mo_clerk` | `staff` | 担当者として統合。`user_business_assignments` で事業割当を管理 |
| `agent_admin` | `partner_admin` | 代理店管理者。自社+下位代理店のデータ閲覧・編集、代理店ユーザー管理 |
| `agent_staff` | `partner_staff` | 代理店担当者。自社+下位代理店のデータ閲覧のみ |
| `application_agent` | (Phase 6以降で検討) | 事業固有機能として必要な場合に追加 |

---

## 8. CSV一括インポート/エクスポート

### 8.1 引き継ぐ仕組み

**設定ベースのCSV管理**:

- エンティティタイプ（販売契約、MO、MOAG等）をパラメータとして受け取り、共通のインポート/エクスポートロジックを使用する
- `SimpleSalesProjectCSV` クラスでフィールドマッピング（日本語ヘッダー → DBカラム名）を定義する
- テンプレートCSVのダウンロード機能（CSV / XLSX両方対応）

**インポート処理**:

- ファイル読み込み: CSV（UTF-8 / Shift-JIS自動判定）、Excel（XLSX）に対応する
- サンプルデータ行の自動除去
- フィールドマッピングによるデータ変換（日本語ヘッダー → DBカラム名）
- 型変換: 整数フィールド、小数フィールド、日付フィールドの自動変換
- 空文字列のNULL変換
- 必須フィールドのバリデーション

**エクスポート処理**:

- 現在のフィルター条件に基づくデータの書き出し
- 日本語ヘッダー付き

**テンプレート**:

- ヘッダー行 + サンプルデータ行を含むテンプレートを生成する
- XLSX形式ではヘッダー行にスタイリング（太字、背景色）を適用する

### 8.2 新システムでの強化

- 事業固有フィールドも動的にCSV列として含める
- `business_config.projectFields` 定義からCSVテンプレートを自動生成する
- インポート時のプレビュー機能を追加する（確認画面で変更内容を確認してから反映）
- `useCSVOperations` フックによる統一的なインポート/エクスポート操作

---

## 9. ファイル管理

### 9.1 引き継ぐ仕組み

**UnifiedFileManager コンポーネント**:

案件・顧客・代理店に紐づくファイルの統合管理を行うUIコンポーネント。以下の機能を持つ。

| 機能 | 説明 |
|------|------|
| アップロード | ドラッグ&ドロップまたはファイル選択によるアップロード |
| プレビュー | 画像ファイルのプレビュー表示 |
| ダウンロード | ファイルのダウンロード |
| 削除 | ファイルの削除（DB上のパスもNULLに更新） |
| 履歴 | ファイル変更履歴の表示（オプション） |

**ファイルカテゴリ**（案件に紐づくファイル）:

| フィールド | 説明 |
|-----------|------|
| `location_list_file` | 設置場所一覧 |
| `checklist_file` | チェックリスト |
| `industrial_association_certificate_file` | 工業会認定証 |
| `sme_agency_application_file` | 中企庁申請書 |
| `sme_agency_certificate_file` | 中企庁認定証 |
| `invoice_file` | 請求書 |
| `receipt_file` | 領収書 |
| `delivery_slip_file` | 納品書 |
| `installation_report_file` | 設置報告書 |

**名刺ファイル**:

- MO代表者の名刺（表裏）: `mos` テーブルに直接保存
- MO担当者の名刺（表裏）: `mo_contacts` テーブルに保存
- MOAG代表者の名刺（表裏）: `moags` テーブルに直接保存
- MOAG担当者の名刺（表裏）: `moag_contacts` テーブルに保存

**ファイル保存方式**:

- ローカルファイルシステム（`/uploads/` ディレクトリ）に保存する
- DBにはファイルのURLパス（`/uploads/...`）を保存する

### 9.2 新システムでの変更

- ファイルカテゴリをカラムからレコードに変更する（`project_files` テーブルの `file_category` カラムで管理）
- 事業固有のファイルカテゴリは `business_config` で定義する
- 1事業目（MOAG事業）のファイルカテゴリは現行の9種類を初期データとして投入する
- 名刺ファイルは引き続き顧客担当者/代理店担当者テーブルに直接保存する

---

## 10. ガントチャート

### 10.1 引き継ぐ仕組み

**表示内容**:

- 案件のムーブメント進捗をガントチャートで表示する
- 横軸にムーブメントのステップ（18ステップ）、縦軸に案件を配置する
- 各セルはムーブメントのステータス（pending / in_progress / completed / skipped）を色分けで表示する

**フィルター**:

| フィルター | 説明 |
|-----------|------|
| 営業ステータス | 特定のステータスの案件のみ表示 |
| 代理店 | 特定の代理店の案件のみ表示 |
| 営業担当者 | 特定の担当者の案件のみ表示 |
| 案件番号 | 部分一致検索 |
| 購入目論見月 | 単月指定または範囲指定 |

**表示データ**（`Movement.getGanttData()`で取得）:

案件ごとにムーブメント情報をJSONアグリゲーションで集約して返す。各ムーブメントには `step_order`, `step_name`, `step_code`, `status`, `sub_status`, `started_at`, `completed_at`, `due_date`, `estimated_days` が含まれる。

### 10.2 新システムでの強化

- 事業横断のガントチャート: 全事業の案件を一覧表示する（事業名を列に追加）
- 事業別のガントチャート: 1事業の案件を表示する（現行と同等）
- ムーブメントのステップ数が事業ごとに異なることへの対応（横軸の列数を動的に変更）
- `movement_templates` テーブルから事業ごとのステップ定義を取得して表示する

---

## 11. ダッシュボード（新規拡張）

### 11.1 現行の統計機能

現行システムの `SalesProject.getStatistics()` で以下の統計を取得している。この統計基盤を拡張してダッシュボードを構築する。

| 統計項目 | 説明 |
|---------|------|
| `total_projects` | 全案件数（失注除外） |
| `purchased_count` | 購入済み件数 |
| `payment_confirmed_count` | 入金確定件数 |
| `contract_in_progress_count` | 契約締結中件数 |
| `a_yomi_count` | Aヨミ件数 |
| `b_yomi_count` | Bヨミ件数 |
| `appointment_count` | アポ中件数 |
| `lost_count` | 失注件数 |
| `prospect_count` | 見込み案件数（購入済み・失注を除く） |
| `total_amount_sum` | 合計金額（失注除外） |
| `purchased_amount_sum` | 購入済み金額 |
| `prospect_amount_sum` | 見込み金額 |
| `average_amount` | 平均案件金額 |

フィルターとして、代理店ID、期間（単月 / 範囲指定）をサポートしている。

### 11.2 全社ダッシュボード（新規）

- 全事業の売上合計、目標達成率
- 事業別売上のサマリーカード
- パイプライン概要（全事業横断のステータス分布）
- 月次推移グラフ

### 11.3 事業別ダッシュボード（新規）

- その事業の売上、目標達成率
- 案件パイプライン（ステータス別件数・金額）
- 代理店別成績ランキング
- 直近のアクティビティ（ムーブメント更新等）

### 11.4 代理店ポータル（新規）

- 自分が関与する事業のみ表示する
- 事業ごとの売上・案件数サマリー
- 自分の案件リスト（閲覧のみ）
- パイプライン進捗

---

## 12. 月次レポート

### 12.1 引き継ぐ仕組み

**現行の月次レポート**（`MonthlyReport.getMonthlyReport()`）:

- 年月（YYYY-MM形式）と代理店IDを指定して取得する
- 代理店の階層構造を再帰CTEで辿り、自社と傘下代理店の案件を集計する
- 購入済み案件のリストと集計値を返す

**権限制御**:

- `admin`, `sales`, `mo_clerk`: 任意の代理店のレポートを閲覧可能（代理店ID必須）
- `agent_admin`: 自社および傘下代理店のレポートのみ閲覧可能

### 12.2 新システムでの拡張

- `monthly_reports` テーブルで事業ごとの月次レポートを管理する
- 全社月次レポート: 全事業を横断した集計
- 事業別月次レポート: 事業単位の集計
- 代理店別月次レポート: 代理店 x 事業の集計
- 月次目標金額の設定・管理機能を追加する

---

## 13. 引き継がない機能・概念

| 現システムの要素 | 理由 |
|---------------|------|
| MO / MOAG の用語 | `customer` / `partner` に一般化 |
| 18ステップのハードコード | テンプレート定義に一般化（事業ごとにステップ数を自由に設定） |
| `sales_status` 等の旧カラム名 | `project_sales_status` に統一済み。新システムの命名規則に従う |
| エンティティ固有のフック（`useProjectData`等） | 汎用フック（`useEntityList`, `useEntityDetail`, `useEntityForm`）に統一 |
| コントローラーごとのレスポンス形式 | 全APIで統一レスポンス形式を使用 |
| `tossup_applications` テーブル | 事業固有機能として必要な場合はPhase 6以降で検討 |
| `referral_applications` テーブル | 同上 |
| `sales_inventory` テーブル | 同上 |
| `agent_materials` テーブル | 同上 |
| `monthly_budgets` テーブル | `monthly_reports` テーブルに `report_target_amount` として統合 |
| `qa_categories` / `qa_items` / `qa_permissions` / `qa_related_items` テーブル | Phase 5で再設計 |
| `inquiries` テーブル | Phase 5で再設計 |
| `user_preferences` テーブル | Phase 0以降で必要に応じて追加 |
| `contract_files` テーブル | `project_files` テーブルに統合 |

---

## 14. 用語対応表

| 現システム | 新システム | 説明 |
|-----------|----------|------|
| MO | Customer（顧客） | 会社レベルの顧客マスタ |
| MOAG | Partner（代理店） | 会社レベルの代理店マスタ |
| 販売契約 / SalesProject | Project（案件） | 事業レベルの案件 |
| `mo_no` | `customer_code` (CST-0001形式) | 顧客コード |
| `moag_no` | `partner_code` (AG-0001形式) | 代理店コード |
| `project_sales_status` | `project_sales_status` | 営業ステータス（カラム名は変更なし） |
| `project_movements` | `project_movements` | ムーブメント進捗（テーブル名は変更なし） |
| `project_movement_templates` | `movement_templates` | ムーブメントテンプレート（`business_id` カラムを追加） |
| `sales_rep_id` | `project_assigned_user_name` + `project_assigned_user_id` | 案件担当者（名前は自由記入、ユーザー紐付けはアクセス制御用） |
| `mo_contacts` | `customer_contacts` | 顧客担当者 |
| `moag_contacts` | `partner_contacts` | 代理店担当者 |
| `mo_antisocial_check_status` | `customer_antisocial_check_status` | 反社チェックステータス |
| `moag_parent_id` | `partner_parent_id` | 親代理店ID |
| `total_machine_amount` | `project_amount` | 案件金額 |
| `contract_files` | `project_files` | 案件ファイル |

---

## 15. データ移行方針

**データ移行は不要。** 新システムは1から運用を開始する。

現行システムのデータ構造は新システムの設計参考として使用するが、データの物理的な移行は行わない。
