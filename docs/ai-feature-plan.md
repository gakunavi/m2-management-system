# AI機能 実装計画書

## Phase 1: インテリジェント・チャットアシスタント

**目的**: 単発照会だけでなく、分析・比較・提案までできるアシスタント
**状態**: ✅ 実装完了・本番デプロイ済み

### Phase 1 基盤（実装済み）

| # | 機能 | ファイル | 状態 |
|---|------|---------|------|
| 1 | チャットUI（Markdown+テーブル表示） | `src/components/features/ai/` | ✅ |
| 2 | DB永続化の会話履歴（CRUD） | `src/app/api/v1/ai/conversations/` | ✅ |
| 3 | OpenAI Function Calling（16関数） | `src/lib/ai/function-definitions.ts` | ✅ |
| 4 | モデル自動切替（AI判定） | `src/lib/ai/openai-client.ts` | ✅ |
| 5 | 管理画面からAPIキー設定（AES-256-GCM暗号化） | `src/app/api/v1/system-settings/` | ✅ |
| 6 | 未設定時のブロック表示 | `src/app/(auth)/ai-assistant/_client.tsx` | ✅ |
| 7 | Enter=改行 / Shift+Enter=送信 | `src/components/features/ai/chat-input.tsx` | ✅ |
| 8 | モバイルレスポンシブ対応 | 各コンポーネント | ✅ |

### DBモデル

```
ChatConversation  — 会話（userId, businessId, title）
ChatMessage       — メッセージ（conversationId, role, content, tableData）
SystemSetting     — システム設定（settingKey, settingValue, isEncrypted）
```

### APIエンドポイント

| メソッド | パス | 用途 |
|---------|------|------|
| POST | `/api/v1/ai/chat` | SSEストリーミングチャット応答 |
| GET | `/api/v1/ai/conversations` | 会話一覧（最新50件） |
| GET | `/api/v1/ai/conversations/:id` | 会話詳細（全メッセージ） |
| PATCH | `/api/v1/ai/conversations/:id` | 会話タイトル変更 |
| DELETE | `/api/v1/ai/conversations/:id` | 会話削除 |
| GET | `/api/v1/ai/status` | AI設定状況の確認 |
| GET | `/api/v1/system-settings` | システム設定取得（admin） |
| PUT | `/api/v1/system-settings` | システム設定更新（admin） |

### 実装済みFunction Calling関数（16関数）

#### 売上・KPI関数

| 関数名 | 用途 | 使える質問例 |
|--------|------|-------------|
| `get_kpi_summary` | KPIサマリー取得 | 「今月の売上は？」「達成率は？」 |
| `get_pipeline` | パイプライン（ステータス別） | 「パイプラインの状況は？」 |
| `get_partner_ranking` | 代理店ランキング | 「一番売ってる代理店は？」 |
| `get_revenue_trend` | 月別売上推移 | 「売上推移を見せて」 |
| `get_kpi_comparison` | 2期間KPI比較 | 「先月と比べて売上どう？」 |
| `get_partner_performance_change` | 代理店パフォーマンス変化 | 「受注が減った代理店は？」 |

#### 案件・マスタデータ関数

| 関数名 | 用途 | 使える質問例 |
|--------|------|-------------|
| `get_project_list` | 案件一覧検索 | 「受注済みの案件は？」「A社の案件」 |
| `get_project_detail` | 案件詳細取得 | 「XX-0042の詳細は？」 |
| `get_business_list` | 事業一覧取得 | 「事業一覧」 |
| `get_customer_list` | 顧客マスタ検索 | 「顧客一覧」「○○社は？」 |
| `get_partner_list` | 代理店マスタ検索 | 「代理店一覧」「Tier1は？」 |

#### タスク管理関数

| 関数名 | 用途 | 使える質問例 |
|--------|------|-------------|
| `get_my_tasks` | 自分の担当タスク一覧 | 「今日のタスクは？」「期限切れのタスク」 |
| `get_task_detail` | タスク詳細取得 | 「TASK-0001の詳細」 |
| `get_board_tasks` | グループボードのタスク一覧 | 「○○ボードのタスク一覧」 |
| `create_task` | 新規タスク作成 | 「A社フォローのタスクを作成して」 |
| `update_task_status` | タスクステータス変更 | 「TASK-0042を完了にして」 |

---

### 1-A. チャット分析力強化（Tier1-①）

**現状の問題**: 単発データ照会はできるが、「先月と比べて受注率どう？」→原因分析→提案の連鎖的な分析が弱い

#### 1-A-1. 事業コンテキスト自動連動 ✅

- [x] chat APIで `businessId` をシステムプロンプトに反映
- [x] システムプロンプトに「ユーザーは現在{事業名}を選択中」を追加
- [x] AIが事業を跨ぐ質問かどうかを判断し、必要に応じて全事業横断で回答
- [x] AIアシスタント画面に事業セレクター追加（サイドバー選択をデフォルト、独立切替可能）
- [x] 会話切替時にその会話の事業コンテキストを復元

**対象ファイル**:
- `src/lib/ai/system-prompt.ts` — プロンプト拡張（userName, businessName, businessId, 現在日時を注入）
- `src/app/api/v1/ai/chat/route.ts` — businessId→事業名解決してprocessChatに渡す
- `src/app/(auth)/ai-assistant/_client.tsx` — 事業セレクターUI

#### 1-A-2. 顧客・代理店一覧関数の追加 ✅

- [x] `get_customer_list` 関数追加（検索・顧客種別フィルタ対応）
- [x] `get_partner_list` 関数追加（階層・Tier情報付き）

#### 1-A-3. 比較分析用の関数強化 ✅

- [x] `get_kpi_comparison` 関数追加（2期間のKPIを比較、差分と変化率を含む）
- [x] `get_partner_performance_change` 関数追加（代理店の月次変化を検知）
- [x] システムプロンプトに比較・分析の指示を強化

#### 1-A-4. タスク管理関数の追加 ✅

- [x] `get_my_tasks` 関数追加（自分担当のタスク一覧、ステータス・期限フィルタ対応）
- [x] `get_task_detail` 関数追加（タスク番号 or ID指定）
- [x] `get_board_tasks` 関数追加（グループボードのタスク一覧）
- [x] `create_task` 関数追加（自然言語からタスク作成）
- [x] `update_task_status` 関数追加（ステータス変更）

**対象ファイル**:
- `src/lib/ai/function-definitions.ts` — 関数定義追加
- `src/lib/ai/function-executor.ts` — 実行ロジック追加（1,241行）

**これが実装されると可能になる会話例**:
```
ユーザー: 「先月と比べて受注率どう？」
AI: 「先月の受注率は32%でしたが、今月は現時点で28%です。
      特にA代理店の受注率が45%→22%に低下しています。
      A代理店の案件一覧を確認しますか？」

ユーザー: 「A代理店の今月の案件を表にして」
AI: [Markdownテーブル表示]

ユーザー: 「A社フォローのタスクを作成して、来週金曜期限で」
AI: 「タスク TASK-0158 を作成しました。
      タイトル: A社フォロー
      期限: 2026-03-27
      優先度: 中」
```

---

### Phase 1 チェックリスト

- [x] 1-A-1: 事業コンテキスト自動連動 + AIアシスタント画面に事業セレクターUI
- [x] 1-A-2: 顧客・代理店一覧関数追加（`get_customer_list`, `get_partner_list`）
- [x] 1-A-3: 比較分析用関数追加（`get_kpi_comparison`, `get_partner_performance_change`）
- [x] 1-A-4: タスク管理関数追加（`get_my_tasks`, `get_task_detail`, `get_board_tasks`, `create_task`, `update_task_status`）
- ~~1-B: 案件サマリー自動生成~~（削除）
- [x] TypeScriptチェック通過
- [x] Lintチェック通過
- [x] ローカル動作確認
- [x] 本番デプロイ・動作確認

---

## Phase 2: UX改善

**目的**: チャットの応答体験を改善
**状態**: ✅ 実装完了・本番デプロイ済み

### 2-1. レスポンスのストリーミング対応 ✅

**改善内容**: 長い回答でも文字が流れるように段階的に表示

**実装方式**:
- [x] Function Calling フェーズは非ストリーミング（関数実行中は「データ取得中...」ステータス表示）
- [x] 最終応答のみ `stream: true` でストリーミング生成
- [x] Server-Sent Events (SSE) でクライアントに段階的に送信
- [x] イベント種別: `init`（会話ID）/ `status`（処理状況）/ `delta`（テキストチャンク）/ `done`（完了）/ `error`
- [x] リアルタイムでMarkdown+テーブルが描画される

**対象ファイル**:
- `src/lib/ai/openai-client.ts` — `processChatStream()` 追加、共通セットアップを `prepareChatContext()` に抽出
- `src/app/api/v1/ai/chat/route.ts` — ReadableStream + SSE レスポンス（`maxDuration = 30`）
- `src/hooks/use-chat.ts` — `fetch` + `ReadableStream.getReader()` でSSE受信、コールバック方式
- `src/app/(auth)/ai-assistant/_client.tsx` — `streamingContent` state でリアルタイム表示

### 2-2. モバイルレスポンシブ対応 ✅

**改善内容**: スマートフォンでも快適に使えるUI

- [x] `100vh`→`100dvh`（iOS Safari対応）
- [x] モバイルではページタイトル非表示でチャットエリア最大化
- [x] ヘッダー: タイトル `flex-1` + `truncate`、事業セレクター幅縮小
- [x] ChatMessage: アイコン・フォント・テーブルセルをモバイル用に縮小、`break-words`で溢れ防止
- [x] ChatInput: 送信ボタン縮小、`maxHeight:120px`（キーボード表示時のスペース確保）
- [x] ConversationList: 削除ボタン `@media(hover:none)` でタッチデバイス常時表示
- [x] 管理者設定: パディング・フォント・保存ボタン全幅化

### Phase 2 チェックリスト

- [x] 2-1: ストリーミング対応
- [x] 2-2: モバイルレスポンシブ対応
- [x] TypeScriptチェック通過
- [x] Lintチェック通過
- [x] ローカル動作確認
- [x] 本番デプロイ・動作確認

---

## Phase 3: 自動分析・レポート

**目的**: AIが自発的に分析し、定型レポートを自動生成
**状態**: ⏸️ 保留（要件詰め中断 — レポート生成のみ残し、アラート・スコアリングは不要と判断）
**想定期間**: 1〜2週間

### 3-1. 週次/月次レポート自動生成（Tier2-⑥）

**目的**: ダッシュボードのデータから経営者向けレポートを自然言語で生成

**実装内容**:
- [ ] `POST /api/v1/ai/generate-report` API追加
- [ ] レポートタイプ: 月次営業レポート / 週次進捗レポート
- [ ] 全事業またはselected事業のデータを収集→AIで要約
- [ ] テンプレート: 概況 → 注目ポイント → アクション推奨
- [ ] レポート画面から「AIレポート生成」ボタン
- [ ] 生成結果をMarkdownで表示 + コピー/ダウンロード

**出力イメージ**:
```
■ 2026年3月 月次営業レポート

【概況】
今月の受注実績は ¥12,500万（目標比 85%）。前月比+12%と回復傾向。

【注目ポイント】
・A代理店が3件の大型案件を受注（¥4,200万）
・C事業部のパイプラインが薄い。来月の見込みが目標の40%

【アクション推奨】
1. C事業部の案件掘り起こし施策を検討
2. A代理店の成功要因をナレッジ共有
```

**対象ファイル**:
- `src/app/api/v1/ai/generate-report/route.ts` — 新規API
- `src/lib/ai/report-generator.ts` — レポート生成ロジック
- レポート画面 — 生成ボタン追加

### ~~3-2. プロアクティブ・アラート（Tier1-②）~~

不要と判断。既存の通知システム（タスク期限超過cronジョブ等）で十分。

### ~~3-3. 受注確度スコアリング（Tier2-④）~~

不要と判断。データ蓄積量が十分になった段階で再検討。

### Phase 3 チェックリスト

- [ ] 3-1: 週次/月次レポート自動生成
- [ ] TypeScriptチェック通過
- [ ] Lintチェック通過
- [ ] ローカル動作確認
- [ ] 本番デプロイ・動作確認

---

## Phase 4: 運用・管理・高度機能

**目的**: 運用のしやすさと高度な分析機能
**想定期間**: 必要に応じて

### 4-1. 利用ログ・コスト管理

- [ ] AIリクエストごとにトークン数・モデル・コストを記録
- [ ] 管理画面に月間利用量グラフ
- [ ] 月間コスト上限設定（超過時はブロック or 警告）

### 4-2. プロンプトテンプレート

- [ ] よく使う質問のテンプレート化（ワンクリックで質問）
- [ ] 例: 「今月のサマリー」「停滞案件を教えて」「代理店ランキング」
- [ ] チャット入力欄の上にクイックアクションボタン表示

### 4-3. ネクストアクション提案（Tier2-⑤）

- [ ] ムーブメント進捗に応じた推奨アクションをAIが提案
- [ ] 過去の成功パターンとの照合
- [ ] 案件詳細ページに「推奨アクション」セクション

### 4-4. 類似案件検索（Tier3-⑦）

- [ ] 顧客属性・案件金額・ニーズなどで類似案件を検索
- [ ] 過去の受注成功事例からの学習

### 4-5. 会話型データ入力（Tier3-⑧）

- [ ] 「今日A社を訪問した。見積もりは来週出す」
- [ ] AIがムーブメント更新 + メモ登録 + リマインダー設定

### 4-6. 予算シミュレーション（Tier3-⑨）

- [ ] 「A代理店の受注率が10%上がったら年間売上は？」
- [ ] 既存データベースをもとにシミュレーション実行

---

## 技術詳細

### モデル選択ロジック

| 設定値 | 動作 |
|--------|------|
| `auto`（推奨） | GPT-4o-miniが質問の複雑さを判定 → basic/advanced を選択 |
| `gpt-4o-mini` | 常にGPT-4o-mini（高速・低コスト） |
| `gpt-4o` | 常にGPT-4o（高品質） |

- **GPT-4o-mini**: データ照会、簡単な質問（~$0.0006/回、100回で$0.06）
- **GPT-4o**: 分析・レポート・複雑な推論（~$0.012/回、100回で$1.20）
- タイトル自動生成は常にGPT-4o-mini
- 設定は`SystemSetting`テーブルに保存、1分間メモリキャッシュ

### APIキー暗号化

- **アルゴリズム**: AES-256-GCM
- **鍵導出**: `ENCRYPTION_KEY` 環境変数 or `NEXTAUTH_SECRET` から scryptSync で32バイト鍵生成
- **保存形式**: `iv:encrypted:authTag`（16進エンコード）
- **表示**: `sk-proj-abc...****` 形式でマスク

### セキュリティ

- admin/staff のみアクセス可（代理店ポータルには開放しない）
- Function Callingの結果にパスワード等の機密情報を含めない
- 全関数でユーザー権限チェック（`getBusinessIdsForUser`）
- Function Call回数上限: 5回/メッセージ
- レスポンストークン上限: 2000トークン

### コード品質

- 新規APIは既存の `handleApiError` パターンに従う
- TypeScript + ESLint のチェックを通す
- 各Phase完了時にローカル動作確認
