# タスク管理機能 仕様書

## 基本方針

| 項目 | 決定事項 |
|------|---------|
| 紐付け | 汎用タスク（案件・顧客・代理店に任意紐付け可 / なしも可） |
| 利用者 | 社内ユーザーのみ（admin / staff） |
| 表示形式 | カンバン + リスト + カレンダーの3ビュー切替 |
| 自動生成 | なし（手動作成のみ） |
| スコープ | 会社全体 / 事業別 / 個人 / **タスクボード** の4種 |
| サブタスク | 階層型サブタスク（2階層まで）+ チェックリスト 両方 |
| 優先度 | 緊急・高・中・低の4段階 |
| タグ | 個人タグ + 共通タグ（全ユーザー作成可）+ **チップ一覧選択** + サジェスト重複抑制 |
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
├── scope                 : String（'company' | 'business' | 'personal' | 'board'）
├── businessId            → Business?（事業スコープ時）
├── boardId               → TaskBoard?（ボードスコープ時）  ★Phase 1.5で追加
├── columnId              → TaskColumn?（カンバン列）  ★Phase 2で追加
├── parentTaskId          → Task?（階層型サブタスク：自己参照、2階層まで）
├── children              : Task[]（子タスク一覧）
├── checklist             : Json [{ id, text, checked }]（手順チェック）
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

### TaskAttachment（添付ファイル）★Phase 2.1 で追加

```
TaskAttachment
├── id                    : Int @id @default(autoincrement())
├── taskId                → Task（onDelete: Cascade）
├── fileName              : String（元のファイル名、最大255文字）
├── fileKey               : String（S3キー、最大500文字）
├── fileSize              : Int（バイト数）
├── mimeType              : String（image/png, application/pdf等、最大100文字）
├── uploadedById          → User（アップロード者）
├── createdAt
```

### TaskColumn（カンバン列）★Phase 2 で追加

```
TaskColumn
├── id                    : Int @id @default(autoincrement())
├── name                  : String（列名、最大100文字）
├── color                 : String?（表示色: hex, e.g. '#3b82f6'）
├── sortOrder             : Int @default(0)（表示順）
├── scope                 : String（'company' | 'business' | 'personal' | 'board'）
├── businessId            → Business?（事業スコープ時）
├── boardId               → TaskBoard?（ボードスコープ時）
├── createdById           → User（作成者）
├── tasks                 : Task[]
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

### TaskBoard（タスクボード）★Phase 1.5 で追加

```
TaskBoard
├── id                    : Int @id @default(autoincrement())
├── name                  : String（ボード名、最大100文字）
├── description           : String?（説明）
├── createdById           → User（作成者）
├── members               : TaskBoardMember[]
├── tasks                 : Task[]
├── createdAt, updatedAt
```

### TaskBoardMember（ボードメンバー）★Phase 1.5 で追加

```
TaskBoardMember
├── boardId               → TaskBoard
├── userId                → User
├── role                  : String（'owner' | 'member'）  ※将来拡張用
├── joinedAt              : DateTime
├── @@id([boardId, userId])
```

### 中間テーブル

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

### 共通タグのチップ一覧選択
- タグ入力欄の**上**に共通タグをカラーチップで一覧表示
- クリックで即付与/解除（トグル動作）
- 入力欄は追加検索・個人タグ選択・新規作成用

### 重複抑制（サジェスト機能）
- タグ入力時に既存の共通タグ + 個人タグを候補表示
- 類似タグがある場合「似たタグがあります」とサジェスト
- 新規作成時にスコープ（共通 / 個人）と色を選択

---

## チェックリスト vs サブタスクの明確化

| | チェックリスト ☑ | サブタスク 📋 |
|---|---|---|
| アイコン | ☑ チェックボックス（オレンジ） | 📋 タスクアイコン（青） |
| ラベル | 「チェックリスト」 | 「サブタスク」 |
| 担当者 | なし | あり（個別設定可） |
| 期限 | なし | あり（個別設定可） |
| ステータス | ☑ / ☐ のみ | todo / in_progress / done / on_hold |
| 通知 | なし | 独自の通知設定を持てる |
| 進捗への影響 | しない | 親タスクの進捗率に影響 |
| 用途 | タスク内の作業手順メモ | 分業・委任が必要な作業単位 |

### 詳細パネルでの表示

```
┌────────────────────────────────┐
│ ☑ チェックリスト (2/3)    [+ 追加] │
│ ■■□ ──────────────────────     │
│ ☑ 原価確認済み                  │
│ ☑ 契約書テンプレート準備         │
│ ☐ 上長承認                     │
├────────────────────────────────┤
│ 📋 サブタスク (1/3完了)    [+ 追加] │
│ ■□□ ──────────────────────     │
│ ✅ ヒアリング  田中  3/20       │  ← クリックで子タスク詳細に遷移
│ 🔄 見積作成   佐藤  3/22       │
│ ⬜ レビュー   鈴木  3/25       │
└────────────────────────────────┘
```

---

## サブタスクの階層表示（リストビュー）

親タスク展開時、ツリー記号で階層構造を視覚化:

```
TASK-0001  A社 新規提案       進行中  🔴緊急  田中  3/25  [重要顧客]
┣ TASK-0002  ヒアリング実施   完了    —      田中  3/20
┣ TASK-0003  見積作成        進行中   —      佐藤  3/22
┗ TASK-0004  提案書レビュー   未着手   —      鈴木  3/25
```

- `┣` 中間の子タスク、`┗` 最後の子タスク
- 子タスク行はインデント + 薄い左ボーダーで視覚的に親子関係を表現
- 子タスクの優先度列は `—` 表示（親から継承、個別表示不要）

---

## 親→サブタスクのパネル遷移 + パンくず

### 遷移フロー

1. 親タスク詳細パネルで子タスク行をクリック
2. パネル内容が子タスク詳細に切り替わる（パネルは閉じない）
3. パネル上部にパンくずナビゲーション表示

### パンくず表示

```
┌──────────────────────────────────────────┐
│ TASK-0001 A社 新規提案 > TASK-0002 ヒアリング  × │
├──────────────────────────────────────────┤
│ ヒアリング実施                              │
│ ステータス: [完了 ▼]  優先度: [中 ▼]          │
│ ...                                       │
└──────────────────────────────────────────┘
```

- パンくずの親部分（`TASK-0001 A社 新規提案`）はクリック可能で親に戻る
- 子タスク詳細では「手順チェック」「メモ」等は表示するが「子タスク」セクションは非表示（2階層制限のため）

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

## タスクボード（グループタスク）

### 概要

Trelloのボード共有に近い仕組み。チーム・部署・プロジェクトチーム単位でタスクボードを作成し、メンバーを招待してタスクを共有する。

### 動作仕様

| 項目 | 仕様 |
|------|------|
| ボード作成 | 全ユーザー（admin / staff）が作成可能 |
| メンバー招待 | メンバー全員が他ユーザーを招待可能 |
| タスクの可視性 | ボード内タスクはメンバー全員が閲覧・編集可能 |
| ボード削除 | 作成者 + admin のみ |
| メンバー脱退 | 自分自身の脱退は可能、他メンバーの除外は作成者 + admin |

### 画面上の表示

タスク管理画面のスコープタブに、参加中のボードがタブとして追加される:

```
[全社] [事業別] [マイタスク] | [役員ボード] [営業チーム] [バックオフィス] [+ ボード作成]
```

- `|` の左側: 標準スコープ（既存）
- `|` の右側: 参加中のタスクボード（動的に表示）
- `[+ ボード作成]` ボタンでボード作成モーダル

### ボード設定画面

- ボード名の編集
- メンバー一覧（ユーザー名 + ロール）
- メンバー招待（ユーザー検索 + 追加）
- ボード削除（作成者 / admin のみ）

### タスク作成時

- スコープ「ボード」選択時、ボードを選択するドロップダウンが表示
- ボードタブ表示中に新規作成すると、自動的にそのボードがスコープに設定される

---

## 画面構成

### メイン画面: `/tasks`

- スコープ切替: 全社 / 事業別 / マイタスク / **ボードタブ**（参加中ボード一覧）
- ビューモード切替: リスト / カンバン / カレンダー
- フィルター: 検索、ステータス（複数選択）、優先度（複数選択）、タグ（複数選択）
- 新規タスク作成ボタン

### リストビュー

- **divベースのCSS gridレイアウト**（tableタグ不使用）
  - `grid-cols-[28px_28px_84px_minmax(180px,1fr)_76px_64px_72px_92px_minmax(80px,160px)_64px_84px]`
  - ヘッダーはスクロール外に固定、ボディは `max-height: calc(100vh - 400px)` でスクロール
- 列: ドラッグハンドル / 展開 / No. / タスク名 / ステータス / 優先度 / 担当者 / 期限 / タグ / アーカイブ / 更新日
- **ソート機能**:
  - デフォルトは手動順（`sortOrder:asc`）
  - 列ヘッダークリックで3段階切替: 昇順 → 降順 → 手動順に戻る
  - ドラッグハンドル列のヘッダー（GripVerticalアイコン）クリックで手動順に戻る
  - D&D並び替え後、手動順以外のソートの場合は自動で手動順（`sortOrder:asc`）に切替
- **一覧取得は常に `parentOnly=true`**（親タスクのみ取得）
  - サブタスクは展開時に `useTaskDetail(taskId)` で個別取得
- **親タスク展開でツリー表示**（└/├ + インデント + 青背景 + 縦ライン）
- 期限超過タスクは赤色表示
- アーカイブ列: チェックボックスでアーカイブON/OFF即時更新
- デフォルトでアーカイブ済みタスク非表示（「アーカイブを表示」フィルターで表示）
- 担当者フィルター: ユーザー名検索ドロップダウン
- **ドラッグ&ドロップ**: dnd-kit SortableContext + PointerSensor（`distance: 8`）
  - 行の並び替え → reorder API で `sortOrder` 一括更新
  - DragOverlay でドラッグ中のプレビュー表示
  - ドラッグ開始時にサブタスク展開を閉じる
  - **DnDコールバック（`handleDragStart` / `handleDragEnd` / `handleDragCancel`）は `useCallback` で安定化**
- ページネーション

### タスク詳細（サイドパネル）

タスク行クリックで右からスライドイン。

- **パンくずナビゲーション**（子タスク表示時: `親タスク > 子タスク`）
- タイトル（インライン編集可）
- ステータス / 優先度（セレクト）
- 担当者 / 期限（「なし」ボタンでクリア可能）
- タグ（**共通タグ/個人タグ チップ一覧** + 編集・削除 + 入力+サジェスト+新規作成）
- URL（入力 + 別タブで開くボタン）
- アーカイブ（チェックボックスで ON/OFF）
- 説明（テキストエリア）
- チェックリスト ☑（追加/チェック/削除、進捗バー表示）
- サブタスク 📋（一覧+追加、進捗バー表示、**クリックでサブタスク詳細に遷移**）
- 通知設定（レベル+通知先）
- メモ（備考）欄
- 削除ボタン

### 新規タスク作成（モーダル）

- タスク名、説明、メモ（備考）、ステータス、優先度、期限（なし可）、スコープ（ボード選択対応）、タグ、通知設定

---

## 権限

| ロール | タスク操作 | タグ操作 | ボード操作 |
|--------|-----------|---------|-----------|
| admin | 全タスクCRUD + 他ユーザーへのアサイン | 共通タグCRUD（全員分）+ マイタグCRUD | 全ボード管理可 |
| staff | 自分作成 + アサインされたタスク + スコープ/ボード内 | 共通タグ作成・自分作成分の編集削除 + マイタグCRUD | 自分参加ボード内のみ |

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

### 添付ファイル ★Phase 2.1

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/v1/tasks/:id/attachments` | 添付ファイル一覧 |
| POST | `/api/v1/tasks/:id/attachments` | アップロード（multipart/form-data、10MB上限、10件上限） |
| GET | `/api/v1/tasks/:id/attachments/:attachmentId` | メタデータ取得 |
| DELETE | `/api/v1/tasks/:id/attachments/:attachmentId` | 削除（アップロード者 or admin） |

### カンバン列 ★Phase 2

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/v1/task-columns` | 列一覧（スコープ別、初回時デフォルト4列自動作成） |
| POST | `/api/v1/task-columns` | 列作成 |
| PATCH | `/api/v1/task-columns/:id` | 列更新（名前・色） |
| DELETE | `/api/v1/task-columns/:id` | 列削除（タスクのcolumnId=nullに） |
| PATCH | `/api/v1/task-columns/reorder` | 列並び替え |

### タスクボード ★Phase 1.5

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/v1/task-boards` | 参加中ボード一覧 |
| POST | `/api/v1/task-boards` | ボード作成 |
| GET | `/api/v1/task-boards/:id` | ボード詳細（メンバー含む） |
| PATCH | `/api/v1/task-boards/:id` | ボード更新（名前・説明） |
| DELETE | `/api/v1/task-boards/:id` | ボード削除（作成者/admin） |
| POST | `/api/v1/task-boards/:id/members` | メンバー招待 |
| DELETE | `/api/v1/task-boards/:id/members/:userId` | メンバー除外/脱退 |

---

## 実装フェーズ

| Phase | 内容 | 状態 |
|-------|------|------|
| **1** | DB + API + リスト表示 + タグ + フィルター + 詳細パネル + 通知 | ✅ 完了 |
| **1.1** | タグチップ一覧選択 + チェックリスト/サブタスクUI明確化 + ツリー表示 + パンくず遷移 | ✅ 完了 |
| **1.5** | タスクボード（DB + API + ボードタブUI + メンバー管理） | ✅ 完了 |
| **1.6** | URL項目 + パンくず修正 + 担当者名検索フィルター + アーカイブ機能 + 一覧アーカイブ列 | ✅ 完了 |
| **1.7** | リストD&D並び替え + ソート3段階切替 + 手動順デフォルト + divベースCSS gridレイアウト | ✅ 完了 |
| **2** | カンバンビュー（カスタム列 + カード/列D&D） + カレンダービュー | ✅ 完了 |
| **2.1** | ファイル添付（S3 + D&D + クリップボード貼り付け + プレビュー） | ✅ 完了 |
| **2.2** | ステータス/優先度プルダウン変更（リスト + カンバン両対応） | ✅ 完了 |
| **2.3** | カンバン列内タスク追加ボタン + グループボードリネーム | ✅ 完了 |
| **3** | ダッシュボード統合 + 案件/顧客/代理店詳細の関連タブ + 通知Cron | 未着手 |
| **4** | ProjectReminder → Task データマイグレーション | 未着手 |

### Phase 1.1 実装ステップ（今回の作業）

```
Step A: タグチップ一覧選択
  - task-tag-input.tsx を修正
  - 共通タグをチップ一覧で表示（入力欄の上）
  - クリックでトグル付与/解除

Step B: チェックリスト vs サブタスクの明確化
  - task-checklist.tsx: ボーダーカード + オレンジアイコン
  - task-subtasks.tsx: ボーダーカード + 青アイコン
  - task-detail-panel.tsx: 両セクションをカードで視覚分離

Step C: 一覧のツリー表示
  - _client.tsx TaskRow: ┣/┗ 記号 + インデント + 左ボーダー
  - 子タスク行のスタイル調整（薄い背景、優先度列「—」表示）

Step D: 親→子タスクのパネル遷移 + パンくず
  - task-detail-panel.tsx: currentTaskId + parentBreadcrumb のstate管理
  - 子タスク行クリックでパネル内容を切り替え
  - パンくず表示（親クリックで戻る）
```

### Phase 1.5 実装ステップ（ボード機能）

```
Step A: DB
  - TaskBoard + TaskBoardMember モデル追加
  - Task に boardId 追加
  - マイグレーション

Step B: ボードAPI
  - CRUD + メンバー管理API
  - tasks API にboardId フィルター追加

Step C: フロント
  - ボードタブUI（スコープ切替の右側に動的表示）
  - ボード作成モーダル
  - ボード設定パネル（メンバー管理）
  - タスク作成時のボード選択
```

### Phase 1.7 実装ステップ（D&D並び替え + ソート + レイアウト）

```
Step A: divベースCSS gridレイアウト
  - tableタグからdiv + CSS gridに移行
  - ヘッダーとボディを分離（ヘッダー固定、ボディスクロール）
  - GRID_COLS定数で列幅を一元管理

Step B: ドラッグ&ドロップ並び替え
  - dnd-kit SortableContext + verticalListSortingStrategy
  - PointerSensor（distance: 8 でクリックとD&Dを区別）
  - handleDragStart / handleDragEnd / handleDragCancel を useCallback で安定化
  - DragOverlay でドラッグ中のプレビュー表示
  - ドラッグ開始時にサブタスク展開を全て閉じる
  - reorder API で sortOrder 一括更新

Step C: ソート3段階切替
  - デフォルトソート: sortOrder:asc（手動順）
  - 列ヘッダークリック: 昇順 → 降順 → 手動順（sortOrder:asc）に戻る
  - GripVerticalアイコン（ドラッグハンドル列ヘッダー）クリックで手動順に即戻し
  - D&D後、現在のソートが手動順でなければ自動切替

Step D: parentOnly=true
  - 一覧APIは常にparentOnly=trueで親タスクのみ取得
  - サブタスクは展開アイコンクリック時にuseTaskDetail(taskId)で個別取得
  - TaskRowWithChildrenコンポーネントで親+子を一体描画
```

### Phase 2 実装ステップ（カンバン + カレンダー）✅ 完了

```
Step A: TaskColumn モデル + API
  - TaskColumn（id, name, color, sortOrder, scope, businessId, createdById）
  - Task に columnId 追加
  - CRUD API: /api/v1/task-columns, /api/v1/task-columns/:id, /api/v1/task-columns/reorder
  - 初回アクセス時にデフォルト4列（未着手/進行中/保留/完了）を自動作成

Step B: カンバンビュー（カスタム列 + Trello式D&D）
  - **カスタム列**: ユーザーが自由に列を作成・削除・名前変更・色設定
  - **列のD&D**: useSortable + horizontalListSortingStrategy + GripVerticalハンドル
  - **カード内D&D**: useSortable + verticalListSortingStrategy（同一列内並び替え + 列間移動）
  - **カスタム衝突検知**: 列ドラッグ中は列のみ検出（closestCenter）、カードドラッグ中は全て検出（closestCorners）
  - **ローカルstate即時反映**: columnItemsRef + localColumnsRef でstale closure防止
  - **カード内容**: タイトル、担当者、期限（期限：）、優先度（優先度：）、タグ
  - **チェックリスト折りたたみ**: ChevronRight/Down + 直接チェック可能
  - **サブタスク折りたたみ**: 階層表示（┣/┗）+ クリックで詳細遷移
  - **列追加ボタン**: ダッシュ枠ボタン
  - **列メニュー**: 列名編集 / 列削除
  - reorder API で columnId + sortOrder 一括更新
  - ★重要: formatTaskListItem に sortOrder を含める（カード並び替え永続化に必須）

Step C: カレンダービュー
  - 月間グリッド（月曜始まりISO週、7列 x 週数）
  - 期限日にタスクカードを表示（優先度で色分け）
  - 月ナビゲーション（前月/翌月/今月リセットボタン）
  - 親タスクのみ表示（parentTaskId !== null を除外）
  - タスククリックで詳細パネル
  - 外部日付ライブラリ不使用（全てローカルヘルパー）
```
