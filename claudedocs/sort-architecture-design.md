# 統一ソート基盤 設計書（フェーズB：実装前レビュー用）

作成日: 2026-06-03 / ブランチ: `refactor/unified-sort`
状態: **レビュー待ち（実装はレビュー合意後）。本番反映なし。ローカル検証完了まで push しない。**

---

## 0. 目的と原則

ユーザー指示：
> 「事業マスタや契約マスタだからとか関係なく、ソートしたい目的・利用シーン・ルールは全て同じ。別々に設計されていること自体がナンセンス。種別の定義順・代理店番号の自然順も同じ枠組みで統一。」

**原則：ソートは全エンティティで単一の仕組み・単一のルールで処理する。**
列ごとに「どう並べるか」を1か所で宣言し、共通エンジンが全画面で同じ挙動を保証する。

---

## 1. 現状の構造的問題（調査で確認済みの事実）

| # | 問題 | 証拠 |
|---|------|------|
| 1 | ソート実装が**4方式に分裂** | 顧客/代理店/事業=`buildOrderBy`+許可リスト、案件=`SORT_FIELD_MAP`+ステータス/カスタムの別経路、会計=`PIPELINE_ORDER_BY_MAP` |
| 2 | **`sortable`設定とAPIソート能力が二重管理・無連動** | config の `sortable:true` と sort-helper の `*_SORT_FIELDS`/route のマップが別ファイル。config は許可リストを参照していない → 黙ってフォールバック（決算月・ポータルが該当） |
| 3 | **業務的に正しい順序がDBソートで表現不可** | 種別(定義順)・階層番号(自然順)・営業ステータス(定義順) は文字列ソートでは不正。アプリ側ソートがエンティティ毎にバラバラに後付け |
| 4 | **定義順の二重定義** | 順序の元は `edit.options`（列定義）にあるのに、サーバーに `SELECT_SORT_ORDER` を別途定義（今回の暫定対応で発生） |
| 5 | **アプリ側ソートは全件取得前提**（ページング崩壊） | `needsListAppSort`/`getCustomSortPagination` で `take: undefined` |
| 6 | **方式が合成できない** | 案件で「ステータス＋他列」の複数列ソートが壊れる（ステータスapp側ソートに第2キー概念なし・カスタムと排他） |
| 7 | **列設定機能と二重結合** | `sortItems`(クエリ用) と `sortState`(列設定永続化用) の2表現が同期。設定モーダル/保存ビュー/ヘッダクリックの3経路がソートを設定。両者はDB(`UserTablePreference`/`SavedTableView`)に永続化 |

→ 個別バグではなく**土台が要求に耐えていない**。列・画面ごとにモグラ叩きが発生する根本原因。

---

## 2. 新アーキテクチャ

### 2.1 単一の SortSpec レジストリ（サーバー/クライアント両用・純モジュール）

各エンティティに、フィールド→ソート戦略の宣言を1か所で持つ。React 非依存の純 `.ts` にして API ルートからも import 可能にする。

```ts
// src/lib/sort/sort-spec.ts
export type SortStrategy =
  | { kind: 'db'; column: string }                    // 例: customerName
  | { kind: 'relation'; path: string[] }              // 例: ['customer','customerName']
  | { kind: 'select'; field: string; order: readonly string[] } // 定義順
  | { kind: 'natural'; field: string }                // 自然順（コード/階層番号）
  | { kind: 'status'; field: string }                 // statusSortOrder 参照
  | { kind: 'customData'; field: string };            // JSONB カスタム（プレフィックス）

export type SortSpec = Record<string /* sortKey */, SortStrategy>;
```

- **`select` の `order` は列定義の `edit.options` を単一ソースに**（重複定義を撤廃）。SortSpec 生成時に options から `value` 配列を導出するヘルパーを用意。
- 案件の `customerLink_*`/`partnerLink_*` select は、顧客/代理店フィールド定義の options を参照（現状の `selectOrderMap` が projectFields のみな不具合も同時解消）。

### 2.2 単一ソートエンジン

```ts
// src/lib/sort/sort-engine.ts
export function resolveSort(sortItems: SortItem[], spec: SortSpec): {
  prismaOrderBy: Record<string, unknown>[];   // DB で確定できるキー
  appSort: SortItem[];                          // アプリ側で処理するキー（select/natural/status/customData）
  needsAppSort: boolean;                        // appSort が1つでもあれば true
};

// アプリ側ソートは全キーを「正しい比較」で多段ソート（合成可能）
export function applyAppSort<T>(rows: T[], sortItems: SortItem[], spec: SortSpec, ctx: AppSortContext): T[];
```

**合成ルール（問題6の解決）**：app側キーが1つでも含まれる場合は、**全キーをアプリ側の多段ソート**で処理する（DB orderBy は同点時のため補助的に使用）。これによりステータス＋他列・カスタム＋他列が正しく合成される。`status` も `statusSortOrder` を引いた数値で他キーと同じ多段比較に乗る。

### 2.3 `sortable` を SortSpec から自動導出（問題2の解決）

- 列の `sortable` は「その列キーが SortSpec に存在するか」で決まる。config の手書き `sortable:true` を廃止 or 自動補完。
- **ドリフト防止テスト**：各エンティティで「config の全列キー ⊆ SortSpec のキー」「`sortable` 表示列は必ず戦略を持つ」をユニットテストで強制。新列追加時に SortSpec 漏れがあればテストが落ちる。

### 2.4 ページング方針（問題5）

- 当面：app側ソートが必要な列のみ全件取得（現状踏襲、件数前提を明記）。
- 将来：app側ソートが必要な列に **DB側の順序列（generated/sortOrder）** を持たせ、DBページングを維持（別タスク。設計だけ残す）。

### 2.5 フィールドキーは不変（移行安全性・問題7）

- 既存の `UserTablePreference.sortState` / `SavedTableView.sortItems` は `{field,direction}[]`。**field キーは一切変えない**ため、保存ビュー・列設定はそのまま有効。データ移行不要。
- 列設定モーダル・保存ビュー・ヘッダクリックの3経路は従来通り `sortItems` に集約（既に修正済みの seed 破棄ロジック `userHasSorted` は維持）。

---

## 3. 影響範囲（列設定機能との結合に特に注意）

| 領域 | 影響 | 対応 |
|------|------|------|
| 列設定モーダル | `sortState` を設定・保存 | field キー不変なので互換維持。`sortState`↔`sortItems` 同期は現状維持 |
| 保存ビュー | `sortItems` を保存・適用（既定ビュー自動適用） | 既存ビューのソート定義はそのまま有効。`userHasSorted` 維持で「シード固着」再発防止 |
| 永続化(DB) | `UserTablePreference`/`SavedTableView` | スキーマ変更なし・データ移行なし |
| ページング | app側ソート時の全件取得 | 現状踏襲（件数注意を明記） |
| 案件の顧客種別列 | DB順 → 定義順へ統一 | SortSpec で `select` 指定（ユーザー要望に対応） |
| 会計パイプライン | 別マップ廃止し統一 | feature ブランチ側だが設計対象に含める |

---

## 4. 移行計画（段階・各段でローカル検証してから次へ）

1. **エンジン新設**（`src/lib/sort/`）：型・`resolveSort`・`applyAppSort` + ユニットテスト。挙動変更なし。
2. **SortSpec 定義**：customer/partner/business/project/accounting の各 spec を作成（options を単一ソースに）。
3. **route 移行（1エンティティずつ）**：各 route を engine に差し替え → **その画面の全ソート列を実機(Playwright)で行の並びまで検証**。
4. **`sortable` 自動導出 + ドリフト防止テスト**追加。
5. **重複撤廃**：暫定の `SELECT_SORT_ORDER` 等を削除し options 由来に統一。
6. **全回帰検証**：全4画面 × 全列 × (単一/複数/解除) × 保存ビュー × 列設定モーダル × ページング。
7. 型・lint・全テスト緑、実機正常を確認 → **その後にプッシュ**（本番反映は別途指示を仰ぐ）。

---

## 5. 検証チェックリスト（完了の定義）

- [ ] 全リスト画面の全 `sortable` 列が、クリックで実際に行が並ぶ（フォールバックでない）
- [ ] 種別＝定義順、コード/階層番号＝自然順、日付/数値＝型通り、ステータス＝定義順
- [ ] 単一列 昇順/降順/解除、順番クリックでの複数列ソートが全画面で同一挙動
- [ ] 複数列でステータス/カスタムを混ぜても第2キー以降が効く
- [ ] 保存ビュー適用・既定ビュー自動適用後もソートが正しく、固着しない
- [ ] 列設定モーダルからのソート設定が反映・永続化される
- [ ] ドリフト防止テストが存在し、SortSpec 漏れで落ちる
- [ ] 型・lint・ユニットテスト全緑

---

## 6. 未決事項（レビューで確認したい点）

1. **会計パイプライン**（`feature/accounting-pipeline`・開発途中）も今回の統一対象に含めるか／このリファクタは main 基準で進め accounting は別途取り込み時に統一するか。
2. **ページング**：当面は app側ソート時の全件取得を許容でよいか（件数規模の想定）。将来のDB順序列対応は別タスク化でよいか。
3. **`sortable` の自動導出**：config の手書き `sortable` を廃止（SortSpec 由来に一本化）してよいか。互換のため当面は併用も可。
