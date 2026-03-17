# AI機能 実装計画書

## Phase 1: インテリジェント・チャットアシスタント

**目的**: 単発照会だけでなく、分析・比較・提案までできるアシスタント
**状態**: ✅ 実装完了（動作確認・デプロイ待ち）

### Phase 1 基盤（実装済み）

| # | 機能 | ファイル | 状態 |
|---|------|---------|------|
| 1 | チャットUI（Markdown+テーブル表示） | `src/components/features/ai/` | ✅ |
| 2 | DB永続化の会話履歴（CRUD） | `src/app/api/v1/ai/conversations/` | ✅ |
| 3 | OpenAI Function Calling（7関数） | `src/lib/ai/function-definitions.ts` | ✅ |
| 4 | モデル自動切替（AI判定） | `src/lib/ai/openai-client.ts` | ✅ |
| 5 | 管理画面からAPIキー設定（暗号化） | `src/app/api/v1/system-settings/` | ✅ |
| 6 | 未設定時のブロック表示 | `src/app/(auth)/ai-assistant/_client.tsx` | ✅ |
| 7 | Enter=改行 / Shift+Enter=送信 | `src/components/features/ai/chat-input.tsx` | ✅ |

### 実装済みFunction Calling関数

| 関数名 | 用途 | 使える質問例 |
|--------|------|-------------|
| `get_kpi_summary` | KPIサマリー取得 | 「今月の売上は？」「達成率は？」 |
| `get_pipeline` | パイプライン（ステータス別） | 「パイプラインの状況は？」 |
| `get_partner_ranking` | 代理店ランキング | 「一番売ってる代理店は？」 |
| `get_revenue_trend` | 月別売上推移 | 「売上推移を見せて」 |
| `get_project_list` | 案件一覧検索 | 「受注済みの案件は？」「A社の案件」 |
| `get_project_detail` | 案件詳細取得 | 「XX-0042の詳細は？」 |
| `get_business_list` | 事業一覧取得 | 「事業一覧」 |
| `get_customer_list` | 顧客マスタ検索 | 「顧客一覧」「○○社は？」 |
| `get_partner_list` | 代理店マスタ検索 | 「代理店一覧」「Tier1は？」 |
| `get_kpi_comparison` | 2期間KPI比較 | 「先月と比べて売上どう？」 |
| `get_partner_performance_change` | 代理店パフォーマンス変化 | 「受注が減った代理店は？」 |

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
- `src/lib/ai/system-prompt.ts` — プロンプト拡張
- `src/app/api/v1/ai/chat/route.ts` — businessId→事業名解決してprocessChatに渡す
- `src/app/(auth)/ai-assistant/_client.tsx` — 事業セレクターUI

#### 1-A-2. 顧客・代理店一覧関数の追加 ✅

- [x] `get_customer_list` 関数追加（検索・業種フィルタ対応）
- [x] `get_partner_list` 関数追加（階層・Tier情報付き）

**対象ファイル**:
- `src/lib/ai/function-definitions.ts` — 関数定義追加
- `src/lib/ai/function-executor.ts` — 実行ロジック追加

#### 1-A-3. 比較分析用の関数強化 ✅

- [x] `get_kpi_comparison` 関数追加（2期間のKPIを比較、差分と変化率を含む）
- [x] `get_partner_performance_change` 関数追加（代理店の月次変化を検知）
- [x] システムプロンプトに比較・分析の指示を強化

**対象ファイル**:
- `src/lib/ai/function-definitions.ts` — 関数定義追加
- `src/lib/ai/function-executor.ts` — 実行ロジック追加
- `src/lib/ai/system-prompt.ts` — 分析指示強化

**これが実装されると可能になる会話例**:
```
ユーザー: 「先月と比べて受注率どう？」
AI: 「先月の受注率は32%でしたが、今月は現時点で28%です。
      特にA代理店の受注率が45%→22%に低下しています。
      A代理店の案件一覧を確認しますか？」

ユーザー: 「A代理店の今月の案件を表にして」
AI: [Markdownテーブル表示]

ユーザー: 「この中で受注見込みが高い案件は？」
AI: 「以下3件が受注確度が高いと推測されます: ...」
```

---

### ~~1-B. 案件サマリー自動生成~~（削除）

実用面での有用性が低いため、Phase 1から除外。

---

### Phase 1 チェックリスト

- [x] 1-A-1: 事業コンテキスト自動連動 + AIアシスタント画面に事業セレクターUI
- [x] 1-A-2: 顧客・代理店一覧関数追加（`get_customer_list`, `get_partner_list`）
- [x] 1-A-3: 比較分析用関数追加（`get_kpi_comparison`, `get_partner_performance_change`）
- ~~1-B: 案件サマリー自動生成~~（削除）
- [x] TypeScriptチェック通過
- [x] Lintチェック通過
- [ ] ローカル動作確認
- [ ] 本番デプロイ・動作確認

---

## Phase 2: UX改善

**目的**: チャットの応答体験を改善
**想定期間**: 数日

### 2-1. レスポンスのストリーミング対応

**現状の問題**: 長い回答は全文生成完了まで待つ必要がある（特にGPT-4o使用時）

**実装内容**:
- [ ] OpenAI APIの `stream: true` オプションを有効化
- [ ] Server-Sent Events (SSE) でクライアントに段階的に送信
- [ ] Function Call結果もストリームに含める
- [ ] UIに文字が流れるように表示するアニメーション追加

**対象ファイル**:
- `src/lib/ai/openai-client.ts` — ストリーミング処理
- `src/app/api/v1/ai/chat/route.ts` — SSEレスポンス
- `src/components/features/ai/chat-message.tsx` — ストリーム表示UI
- `src/hooks/use-chat.ts` — SSE受信ロジック

**注意**: Function Callingとストリーミングの組み合わせは複雑。段階的に実装する。

### Phase 2 チェックリスト

- [ ] 2-1: ストリーミング対応
- [ ] TypeScriptチェック通過
- [ ] Lintチェック通過
- [ ] ローカル動作確認
- [ ] 本番デプロイ・動作確認

---

## Phase 3: 自動分析・レポート

**目的**: AIが自発的に分析し、定型レポートを自動生成
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

### 3-2. プロアクティブ・アラート（Tier1-②）

**目的**: AIが異常を自動検知して通知

**アラートタイプ**:
1. 案件停滞アラート（N日間ステータス変化なし）
2. 受注予測乖離アラート（目標と実績の乖離が大きい）
3. 代理店パフォーマンス変化（前月比で大幅な変動）

**実装内容**:
- [ ] `src/lib/ai/alert-analyzer.ts` — アラート分析ロジック
- [ ] 日次バッチ実行: Cron Job or 管理画面からの手動実行
- [ ] アラート結果をDB保存（新テーブル `ai_alerts`）
- [ ] ダッシュボードにアラートウィジェット表示
- [ ] 既存の通知システム（`notifications`テーブル）と連携
- [ ] アラート閾値を管理画面で設定可能に

**DBスキーマ（案）**:
```prisma
model AiAlert {
  id          Int      @id @default(autoincrement())
  businessId  Int      @map("business_id")
  alertType   String   @map("alert_type") @db.VarChar(50)
  severity    String   @db.VarChar(20) // info, warning, critical
  title       String   @db.VarChar(200)
  description String   @db.Text
  metadata    Json?
  isRead      Boolean  @default(false) @map("is_read")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  business Business @relation(fields: [businessId], references: [id])

  @@index([businessId, createdAt(sort: Desc)])
  @@map("ai_alerts")
}
```

**対象ファイル**:
- `src/lib/ai/alert-analyzer.ts` — 新規
- `src/app/api/v1/ai/alerts/route.ts` — 新規API
- `prisma/schema.prisma` — AiAlertモデル追加
- ダッシュボードページ — アラートウィジェット

### 3-3. 受注確度スコアリング（Tier2-④）

**目的**: 各案件に受注確度スコアを付与

**スコアリング要素**:
- ムーブメント進捗率（何%まで進んでいるか）
- ステータスの滞留期間（平均と比較）
- 顧客の過去受注率
- 代理店の受注率
- 案件金額帯（高額→受注率低下傾向）

**実装内容**:
- [ ] `src/lib/ai/scoring.ts` — ルールベースのスコアリングエンジン
- [ ] `Project` モデルに `aiScore` フィールド追加（定期更新）
- [ ] 案件一覧にスコアカラム表示
- [ ] 案件詳細にスコア内訳表示
- [ ] AIチャットから「受注確度が高い案件は？」で参照可能

**注意**: LLMではなくルールベース+重み付けで実装（低コスト・高速）。
データが100件以上蓄積されたら精度を検証し、必要なら調整。

**対象ファイル**:
- `src/lib/ai/scoring.ts` — 新規
- `prisma/schema.prisma` — aiScoreフィールド
- 案件一覧・詳細ページ — スコア表示

### Phase 3 チェックリスト

- [ ] 3-1: 週次/月次レポート自動生成
- [ ] 3-2: プロアクティブ・アラート
- [ ] 3-3: 受注確度スコアリング
- [ ] DBマイグレーション作成・適用
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

## 実装時の共通ルール

### コード品質
- 新規APIは既存の `handleApiError` パターンに従う
- Function Calling関数はユーザー権限チェック必須（`getBusinessIdsForUser`）
- TypeScript + ESLint + Prettier のチェックを通す

### セキュリティ
- admin/staff のみアクセス可（代理店ポータルには開放しない）
- Function Callingの結果にパスワード等の機密情報を含めない
- APIキーは引き続きAES-256-GCM暗号化

### テスト・確認
- 各Phase完了時にローカル動作確認
- 本番デプロイ前にlint + TypeScriptチェック
- 主要な質問パターンでの回答品質を確認

### コスト管理
- デフォルトモデルは `auto`（大半はGPT-4o-mini）
- Function Call回数上限: 5回/メッセージ
- レスポンストークン上限: 2000トークン
- レポート生成等の長文は上限を個別に設定
