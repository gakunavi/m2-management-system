# タスク管理機能 仕様書

## 基本方針

| 項目 | 決定事項 |
|------|---------|
| 紐付け | 汎用タスク（案件・顧客・代理店に任意紐付け可 / なしも可） |
| 利用者 | 社内ユーザーのみ（admin / staff） |
| 表示形式 | カンバン + リスト + カレンダーの3ビュー切替 |
| 自動生成 | なし（手動作成のみ） |
| スコープ | 会社全体 / 事業別 / 個人の3階層 |
| サブタスク | 階層型サブタスク（2階層まで）+ チェックリスト 両方 |
| 優先度 | 緊急・高・中・低の4段階 |
| タグ | 個人タグ + 共通タグ（全ユーザー作成可）+ サジェスト重複抑制 |
| 通知 | タスク毎に通知レベル・通知先を設定可能 |
| 備考 | メモ（備考）欄あり（コメント機能は不採用） |
| 期限 | 期限なし（未設定）も選択可能 |
| 既存機能 | ProjectReminder を段階的にタスク機能に統合 |

---

## データモデル

### Task（タスク）

```
Task
├── id                    : Int @id @default(autoincrement())
├── taskNo                : String @unique（自動採番: TASK-0001）
├── title                 : String（タスク名、最大200文字）
├── description           : String?（説明）
├── status                : String（'todo' | 'in_progress' | 'done' | 'on_hold'）
├── priority              : String（'urgent' | 'high' | 'medium' | 'low'）
├── dueDate               : DateTime?（期限、null = 期限なし）
├── assigneeId            → User?（担当者）
├── createdById           → User（作成者）
├── scope                 : String（'company' | 'business' | 'personal'）
├── businessId            → Business?（事業スコープ時）
├── parentTaskId          → Task?（階層型サブタスク：自己参照、2階層まで）
├── children              : Task[]（子タスク一覧）
├── checklist             : Json [{ id, text, checked }]
├── sortOrder             : Int（カンバン内の並び順）
├── relatedEntityType     : String?（'project' | 'customer' | 'partner'）
├── relatedEntityId       : Int?
├── notifyLevel           : String（'none' | 'in_app' | 'in_app_and_email'）デフォルト: 'in_app'
├── memo                  : String?（備考・メモ欄）
├── notifyTargets         : TaskNotifyTarget[]（通知先リスト）
├── tags                  : TaskTagOnTask[]（多対多）
├── completedAt           : DateTime?
├── version               : Int @default(1)（楽観的ロック）
├── createdAt, updatedAt
```

### TaskTag（タグ）

```
TaskTag
├── id                    : Int @id
├── name                  : String（タグ名、最大100文字）
├── color                 : String（表示色: hex, e.g. '#ef4444'）
├── scope                 : String（'shared' | 'personal'）
├── ownerId               → User（作成者）
├── @@unique([name, scope, ownerId])
```

### TaskTagOnTask / TaskNotifyTarget（中間テーブル）

- TaskTagOnTask: taskId + tagId の複合主キー
- TaskNotifyTarget: taskId + userId の複合主キー

---

## タグの仕組み

| | 共通タグ（shared） | 個人タグ（personal） |
|---|---|---|
| 作成 | 全ユーザーが作成可 | 全ユーザーが自分用に作成 |
| 可視範囲 | 全ユーザーに表示 | 作成者のみに表示 |
| タスクへの付与 | 誰でも付与可 | 作成者のみ付与可 |
| 編集・削除 | 作成者 + admin | 作成者のみ |

### 重複抑制（サジェスト機能）
- タグ入力時に既存の共通タグ + 個人タグを候補表示
- 類似タグがある場合「似たタグがあります」とサジェスト
- 新規作成時にスコープ（共通 / 個人）と色を選択

---

## 通知設定

タスク毎に通知レベルと通知先を設定可能。

| 設定 | 挙動 |
|------|------|
| `none` | 一切通知しない |
| `in_app` | アプリ内通知のみ（デフォルト） |
| `in_app_and_email` | アプリ内 + メール |

通知先（notifyTargets）はデフォルトで担当者が入り、任意のユーザーを追加可能。

---

## 画面構成

### メイン画面: `/tasks`

- スコープ切替: 全社 / 事業別 / マイタスク
- ビューモード切替: リスト / カンバン / カレンダー
- フィルター: 検索、ステータス（複数選択）、優先度（複数選択）、タグ（複数選択）
- 新規タスク作成ボタン

### リストビュー（Phase 1 実装済み）

- テーブル形式: No. / タスク名 / ステータス / 優先度 / 担当者 / 期限 / タグ / 更新日
- ヘッダークリックでソート切替
- 親タスク展開で子タスクインデント表示
- 期限超過タスクは赤色表示
- ページネーション

### タスク詳細（サイドパネル）

タスク行クリックで右からスライドイン。

- タイトル（インライン編集可）
- ステータス / 優先度（セレクト）
- 担当者 / 期限（「なし」ボタンでクリア可能）
- タグ（入力+サジェスト+新規作成）
- 説明（テキストエリア）
- チェックリスト（追加/チェック/削除、進捗バー表示）
- サブタスク（一覧+追加、進捗バー表示）
- 通知設定（レベル+通知先）
- メモ（備考）欄
- 削除ボタン

### 新規タスク作成（モーダル）

- タスク名、説明、メモ（備考）、ステータス、優先度、期限（なし可）、スコープ、タグ、通知設定

---

## 権限

| ロール | タスク操作 | タグ操作 |
|--------|-----------|---------|
| admin | 全タスクCRUD + 他ユーザーへのアサイン | 共通タグCRUD（全員分）+ マイタグCRUD |
| staff | 自分作成 + アサインされたタスク CRUD + スコープ内閲覧 | 共通タグ作成・自分作成分の編集削除 + マイタグCRUD |

---

## API

### タスク

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/v1/tasks` | 一覧（フィルター・ソート・ページネーション） |
| POST | `/api/v1/tasks` | 新規作成（自動採番・通知） |
| GET | `/api/v1/tasks/:id` | 詳細（子タスク・チェックリスト含む） |
| PATCH | `/api/v1/tasks/:id` | 更新（楽観的ロック） |
| DELETE | `/api/v1/tasks/:id` | 削除（子タスク連鎖削除） |
| PATCH | `/api/v1/tasks/reorder` | カンバン並び替え |

### タグ

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/v1/task-tags` | 共通+個人タグ一覧 |
| POST | `/api/v1/task-tags` | 新規作成（共通タグ重複チェック） |
| PATCH | `/api/v1/task-tags/:id` | 更新 |
| DELETE | `/api/v1/task-tags/:id` | 削除 |
| GET | `/api/v1/task-tags/suggest?q=` | サジェスト検索 |

---

## 実装フェーズ

| Phase | 内容 | 状態 |
|-------|------|------|
| **1** | DB + API + リスト表示 + タグ + フィルター + 詳細パネル + 通知 | ✅ 完了 |
| **2** | カンバンビュー（dnd-kit）+ カレンダービュー（月間） | 未着手 |
| **3** | ダッシュボード統合 + 案件/顧客/代理店詳細の関連タブ + 通知Cron | 未着手 |
| **4** | ProjectReminder → Task データマイグレーション | 未着手 |
