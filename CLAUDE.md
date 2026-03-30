# m2-management-system プロジェクト指示

## 機能実装時の必須チェックリスト

新機能を実装した際、「ビルド成功」で完了とせず、以下の全経路を検証すること。

### データフロー全経路チェック（CRUD）

1. **CREATE（POST）**: スキーマに新フィールドがあるか → create処理で値を渡しているか
2. **READ（GET一覧）**: 新フィールドがselectに含まれるか → フォーマッターで正しく返るか
3. **READ（GET詳細）**: 同上 → 詳細画面に表示されるか
4. **UPDATE（PATCH）**: スキーマ外のフィールドは明示的に取り出しているか → マージ更新で既存値が消えないか
5. **インライン編集**: customPatchのbody生成 → API側の受け取り → 必要な付帯情報（businessId等）が欠落していないか
6. **フォーム編集**: unflattenDotKeysの変換 → APIへの送信 → 必要な付帯情報が含まれるか

### テーブル設計からの逆算

中間テーブル（CustomerBusinessLink等）に属するデータを操作する場合、**常に外部キー（businessId等）が必要**。
以下の問いに答えること：
- そのデータはどのテーブルに格納されるか？
- 操作に必要な外部キーは何か？
- その外部キーはフロントから送信されるか？

### 呼び出し元の全画面差し替え確認

フックやユーティリティを作成・変更した場合、**古い静的importを使っている全画面をgrepで検出**し、全て差し替えること。
対象画面: 一覧 / 詳細 / 編集 / 新規 / クロスエンティティタブ（例: 案件詳細→顧客情報タブ）

```bash
# 例: customerDetailConfig を useCustomerConfig に差し替えた場合
grep -r "customerDetailConfig" src/app/ src/components/
# → ヒットした全ファイルを更新するまでタスク未完了
```

### 既存パターンとの対比

新エンティティにフィールドを追加する際、**既に同機能が動いているエンティティ（例: Project）のコードと対比**し、漏れを検出すること。

## アーキテクチャ概要

### Config駆動アーキテクチャ
- `EntityListConfig` / `EntityDetailConfig` / `EntityFormConfig` で一覧・詳細・フォームを宣言的に定義
- 動的フック（`useCustomerConfig`, `usePartnerConfig`, `useProjectConfig`）がカスタムフィールドを注入

### カスタムフィールドの3層構造

| レイヤー | 格納先 | スコープ | フック |
|---------|--------|---------|-------|
| グローバル定義 | `SystemSetting` | 全事業共通 | `useGlobalFieldDefinitions` |
| 事業別定義 | `Business.businessConfig` | 事業固有 | `useEntityFieldDefinitions` |
| グローバルデータ | `Customer.customerCustomData` / `Partner.partnerCustomData` | 本体モデル | 直接CRUD |
| 事業別データ | `CustomerBusinessLink.linkCustomData` / `PartnerBusinessLink.linkCustomData` | 中間テーブル | **businessId必須** |

### フラット展開キー命名規則

| 種別 | フォーマッターキー | 列キー | フォームキー |
|------|-------------------|--------|-------------|
| 顧客グローバル | `customerGlobal_xxx` | `customerGlobal_xxx` | `customerCustomData.xxx` |
| 顧客事業別 | `customerLink_xxx` | `customerLink_xxx` | `linkCustomData.xxx` |
| 代理店グローバル | `partnerGlobal_xxx` | `partnerGlobal_xxx` | `partnerCustomData.xxx` |
| 代理店事業別 | `partnerLink_xxx` | `partnerLink_xxx` | `linkCustomData.xxx` |

### 主要パターン

- **インラインPATCH**: `customPatch.extraBody` で付帯情報（businessId等）を送信。関数型も可（`(row) => ({ version, businessId })`）
- **クロスエンティティPATCH**: 案件一覧から顧客/代理店フィールドを直接編集。`customPatch.endpoint` で別エンティティのAPIを指定し、`extraBody` 関数で対象エンティティの `version` を動的に渡す
- **ダブルクリック編集**: `ColumnDef.doubleClickToEdit` + `singleClickHref` でリンク列（顧客名・代理店名）をシングルクリック→遷移 / ダブルクリック→編集に対応。250ms遅延タイマーでダブルクリック検出時にナビゲーションをキャンセル
- **通常PATCH**: `patchEndpoint` に `?businessId=X` クエリパラメータを付与（レスポンスで事業別データも展開するため）
- **フォームPATCH**: `config.extraSubmitData` で付帯情報を自動マージ
- **PATCHレスポンス整合性**: GETで返す全フィールドをPATCHレスポンスにも含めること（行全体置換でデータ消失防止）。特に案件PATCHではクロスエンティティのフラット展開フィールド（`customerName`, `customerVersion`, `partnerName`, `partnerVersion`等）を明示的に返す必要がある（`formatProject`だけではネスト構造のみで不足）
- **子エンティティPATCH**: 連絡先等の子テーブルPATCHレスポンスは親行と別スキーマ。行置換せず一覧invalidate（`isSameEntity`判定）
- **クロスエンティティキャッシュ**: 案件一覧から顧客/代理店を編集時、顧客/代理店の詳細・一覧キャッシュも無効化
- **Zodスキーマ外フィールド**: `body.xxx` で手動取り出し → マージ更新
- **楽観的ロック**: `version: { increment: 1 }` + 409 Conflict
- **ドット記法**: `unflattenDotKeys` / `flattenNestedToFormKeys` で変換

## 技術スタック

- Next.js 14 App Router + TypeScript
- Prisma + PostgreSQL
- TanStack Query（キャッシュは `predicate` で前方一致無効化）
- Radix UI（`<SelectItem value="">` 禁止）
- Zustand（事業スコープ管理）
