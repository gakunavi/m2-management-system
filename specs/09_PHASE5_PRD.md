# Phase 5: ファイル管理 + QA/問い合わせ管理 PRD

**作成日**: 2026-02-27
**前提**: Phase 0〜4 完了済み
**参照**: 旧MOAGシステム (`moag-management-system`) のQA/問い合わせ実装

---

## 1. スコープ

| サブフェーズ | 機能 | 概要 |
|------------|------|------|
| **5A** | ファイル管理 | 案件に紐づくファイルのアップロード・管理。事業ごとのファイルカテゴリ対応 |
| **5B** | QA/問い合わせ管理 | カテゴリ別FAQナレッジベース + 問い合わせチケット管理 + QA変換 |

**スコープ外**: 通知・アラート、月次レポート、一括操作強化

---

## 2. Phase 5A: ファイル管理

### 2.1 概要

案件に紐づくファイル（見積書、請求書、報告書等）をアップロード・管理する機能。
旧システムの9種類のファイルカテゴリを事業設定（`businessConfig`）で定義可能にする。

### 2.2 データモデル

#### ProjectFile テーブル

| カラム | 型 | 説明 |
|--------|-----|------|
| id | Int PK | |
| project_id | FK → projects | 案件 |
| file_name | VARCHAR(255) | ストレージ上のファイル名 |
| file_original_name | VARCHAR(255) | アップロード時のオリジナルファイル名 |
| file_storage_key | VARCHAR(500) | ストレージキー |
| file_url | VARCHAR(500) | 公開URL |
| file_size | Int | バイト数 |
| file_mime_type | VARCHAR(100) | MIMEタイプ |
| file_category | VARCHAR(50)? | ファイルカテゴリ（businessConfigで定義） |
| file_description | TEXT? | ファイル説明 |
| created_at | TIMESTAMPTZ | |
| created_by | FK → users? | アップロードしたユーザー |

**インデックス**: `(project_id)`, `(project_id, file_category)`

#### businessConfig拡張

```json
{
  "fileCategories": [
    { "key": "location_list", "label": "設置場所一覧", "sortOrder": 1 },
    { "key": "checklist", "label": "チェックリスト", "sortOrder": 2 },
    { "key": "industrial_certificate", "label": "工業会認定証", "sortOrder": 3 },
    { "key": "sme_application", "label": "中企庁申請書", "sortOrder": 4 },
    { "key": "sme_certificate", "label": "中企庁認定証", "sortOrder": 5 },
    { "key": "invoice", "label": "請求書", "sortOrder": 6 },
    { "key": "receipt", "label": "領収書", "sortOrder": 7 },
    { "key": "delivery_slip", "label": "納品書", "sortOrder": 8 },
    { "key": "installation_report", "label": "設置報告書", "sortOrder": 9 }
  ]
}
```

### 2.3 API

| メソッド | パス | 説明 | 権限 |
|---------|------|------|------|
| GET | `/api/v1/projects/[id]/files` | ファイル一覧 | 全ロール |
| POST | `/api/v1/projects/[id]/files` | アップロード | admin, staff |
| DELETE | `/api/v1/projects/[id]/files/[fileId]` | 削除 | admin, staff |

### 2.4 UI

- **ProjectFilesTab**: 案件詳細のカスタムタブ。ファイル一覧テーブル + カテゴリフィルタ + アップロード/削除
- **FileUploadDialog**: アップロードダイアログ（D&D + カテゴリ選択 + 説明入力）
- 全ロールで表示（`COMMON_CUSTOM_TABS` に登録）

### 2.5 仕様詳細

- 対応MIME: PDF, Word(.docx), Excel(.xlsx), JPEG, PNG, WebP, ZIP
- 最大ファイルサイズ: 10MB
- ストレージパス: `project-files/{projectId}/{timestamp}-{random}.ext`
- 既存の `StorageAdapter` + `useFileUpload` を再利用

---

## 3. Phase 5B: QA/問い合わせ管理

### 3.1 概要

旧MOAGシステムのQA/問い合わせ機能を新アーキテクチャで再設計。

**3つの柱**:
1. **QAナレッジベース**: カテゴリ別FAQ管理。admin/staffが作成・管理、全ロールが閲覧
2. **問い合わせ管理**: 全ロールが起票、admin/staffが対応・回答
3. **問い合わせ→QA変換**: 有用な問い合わせをナレッジベースに昇格

### 3.2 旧システムからの引き継ぎ方針

| 旧システム | 新システム | 変更理由 |
|-----------|----------|---------|
| `qa_categories` + `display_order` + `is_active` | `QaCategory` (`categorySortOrder` + `categoryIsActive`) | 命名規則統一 |
| `qa_items.status: draft/published` + `view_count` | `QaItem` (`itemStatus` + `itemViewCount`) | 同上 |
| `qa_permissions` テーブル（ロール×QA項目） | `QaItem.itemIsPublic` フラグ | 簡素化（partner系はpublicのみ閲覧で十分） |
| `qa_related_items` (関連QA自動提案) | Phase 5ではスキップ | 将来拡張 |
| `attached_files` (JSON配列) | `QaAttachment` / `InquiryAttachment` テーブル | 正規化でクエリ・削除が容易に |
| `inquiries.status: new/in_progress/resolved/converted_to_qa` | `Inquiry` (同ステータスフロー) | フロー踏襲 |
| `inquiry → QA変換` | `POST /api/v1/inquiries/[id]/convert-to-qa` | 機能踏襲 |

### 3.3 データモデル

#### QaCategory テーブル

| カラム | 型 | 説明 |
|--------|-----|------|
| id | Int PK | |
| category_name | VARCHAR(100) | カテゴリ名 |
| category_description | TEXT? | 説明 |
| category_sort_order | Int | 表示順 |
| category_is_active | Boolean | 有効フラグ |
| created_at, updated_at | TIMESTAMPTZ | |
| created_by | FK → users? | |

#### QaItem テーブル

| カラム | 型 | 説明 |
|--------|-----|------|
| id | Int PK | |
| category_id | FK → qa_categories | カテゴリ |
| item_title | VARCHAR(200) | タイトル |
| item_question | TEXT | 質問文 |
| item_answer | TEXT | 回答文 |
| item_status | VARCHAR(20) | `draft` / `published` |
| item_is_public | Boolean | partner系に公開するか |
| item_view_count | Int | 閲覧数 |
| item_sort_order | Int | 表示順 |
| item_published_at | TIMESTAMPTZ? | 公開日時 |
| created_at, updated_at | TIMESTAMPTZ | |
| created_by, updated_by | FK → users? | |

#### QaAttachment テーブル

| カラム | 型 | 説明 |
|--------|-----|------|
| id | Int PK | |
| qa_item_id | FK → qa_items | QA項目 |
| attachment_name | VARCHAR(255) | ストレージ上のファイル名 |
| attachment_original_name | VARCHAR(255) | オリジナルファイル名 |
| attachment_storage_key | VARCHAR(500) | ストレージキー |
| attachment_url | VARCHAR(500) | 公開URL |
| attachment_size | Int | バイト数 |
| attachment_mime_type | VARCHAR(100) | MIMEタイプ |
| created_at | TIMESTAMPTZ | |
| uploaded_by | FK → users? | |

#### Inquiry テーブル

| カラム | 型 | 説明 |
|--------|-----|------|
| id | Int PK | |
| inquiry_subject | VARCHAR(200) | 件名 |
| inquiry_body | TEXT | 本文 |
| inquiry_status | VARCHAR(20) | `new` / `in_progress` / `resolved` / `converted_to_qa` |
| inquiry_category_id | FK → qa_categories? | カテゴリ |
| inquiry_project_id | FK → projects? | 関連案件（任意） |
| inquiry_assigned_user_id | FK → users? | 担当者 |
| inquiry_response | TEXT? | 回答内容 |
| inquiry_responded_at | TIMESTAMPTZ? | 回答日時 |
| inquiry_responded_by | FK → users? | 回答者 |
| inquiry_is_converted_to_qa | Boolean | QA変換済みフラグ |
| inquiry_converted_qa_id | FK → qa_items? | 変換先QA |
| created_at, updated_at | TIMESTAMPTZ | |
| created_by | FK → users | 起票者 |

#### InquiryAttachment テーブル

`QaAttachment` と同構造（`inquiry_id` FK → inquiries）

### 3.4 ステータスフロー

**QA項目**:
```
draft → published（公開操作で item_published_at 設定）
published → draft（非公開に戻す）
```

**問い合わせ**:
```
new → in_progress（担当者アサイン時）
    → resolved（回答送信時）
    → converted_to_qa（QA変換時）
in_progress → resolved
            → converted_to_qa
```

### 3.5 API

**QAカテゴリ**:

| メソッド | パス | 説明 | 権限 |
|---------|------|------|------|
| GET | `/api/v1/qa/categories` | 一覧 | 全ロール |
| POST | `/api/v1/qa/categories` | 作成 | admin |
| PATCH | `/api/v1/qa/categories/[id]` | 更新 | admin |
| DELETE | `/api/v1/qa/categories/[id]` | 論理削除 | admin |

**QA項目**:

| メソッド | パス | 説明 | 権限 |
|---------|------|------|------|
| GET | `/api/v1/qa/items` | 一覧（検索・カテゴリ・ステータスフィルタ） | 全ロール（partner系はpublished+publicのみ） |
| GET | `/api/v1/qa/items/[id]` | 詳細（閲覧数+1） | 全ロール |
| POST | `/api/v1/qa/items` | 作成 | admin, staff |
| PATCH | `/api/v1/qa/items/[id]` | 更新 | admin, staff |
| DELETE | `/api/v1/qa/items/[id]` | 削除 | admin |
| PATCH | `/api/v1/qa/items/[id]/publish` | 公開/非公開切替 | admin, staff |

**QA添付ファイル**:

| メソッド | パス | 説明 | 権限 |
|---------|------|------|------|
| POST | `/api/v1/qa/items/[id]/attachments` | アップロード | admin, staff |
| DELETE | `/api/v1/qa/items/[id]/attachments/[attachmentId]` | 削除 | admin, staff |

**問い合わせ**:

| メソッド | パス | 説明 | 権限 |
|---------|------|------|------|
| GET | `/api/v1/inquiries` | 一覧 | admin/staff: 全件 / partner系: 自分の起票分 |
| GET | `/api/v1/inquiries/[id]` | 詳細 | admin/staff / 起票者本人 |
| POST | `/api/v1/inquiries` | 起票 | 全ロール |
| PATCH | `/api/v1/inquiries/[id]` | 更新（アサイン・ステータス変更） | admin, staff |
| POST | `/api/v1/inquiries/[id]/respond` | 回答送信 | admin, staff |
| POST | `/api/v1/inquiries/[id]/convert-to-qa` | QA変換 | admin, staff |
| DELETE | `/api/v1/inquiries/[id]` | 削除 | admin |

**問い合わせ添付ファイル**:

| メソッド | パス | 説明 | 権限 |
|---------|------|------|------|
| POST | `/api/v1/inquiries/[id]/attachments` | アップロード | admin, staff |
| DELETE | `/api/v1/inquiries/[id]/attachments/[attachmentId]` | 削除 | admin, staff |

### 3.6 UI

**QAナレッジベース（全ロール閲覧）**:
- `/qa` ページ: カテゴリサイドバー + 検索 + アコーディオン形式QA一覧
- QA詳細: タイトル・質問・回答・添付ファイルリンク

**QA管理（admin/staff）**:
- `/qa/manage` ページ: Config駆動テンプレートによるCRUD
- カテゴリ管理: 事業ステータス定義管理と同パターン（並べ替え + 追加 + 編集 + 削除）

**問い合わせ管理**:
- `/inquiries` ページ: Config駆動テンプレートによる一覧
- `/inquiries/new` ページ: 起票フォーム
- `/inquiries/[id]` ページ: 詳細（回答フォーム + QA変換ボタン含む）

### 3.7 初期データ（seed）

QAカテゴリ（旧システム6カテゴリ準拠）:
1. システム利用方法
2. 営業関連
3. 代理店関連
4. 契約・手続き
5. トラブルシューティング
6. その他

---

## 4. ナビゲーション追加

| ラベル | パス | アイコン | 条件 |
|-------|------|---------|------|
| QA/ナレッジ | /qa | BookOpen | なし |
| 問い合わせ | /inquiries | MessageSquare | なし |

---

## 5. スコープ外（将来拡張）

| 機能 | 理由 |
|------|------|
| `qa_related_items` (関連QA自動提案) | 初期リリース後のデータ蓄積後に検討 |
| 全文検索（PostgreSQL tsvector） | MVPでは LIKE 検索で十分 |
| 添付ファイルのバージョン管理 | 現時点では不要 |
| 問い合わせのメール通知 | 通知機能全体をPhase 5スコープ外とした |
