# m2-management-system プロジェクト指示

## 機能実装時の必須チェックリスト

新機能を実装した際、「ビルド成功」で完了とせず、以下の全経路を検証すること。

### データフロー全経路チェック（CRUD）

1. **CREATE（POST）**: スキーマに新フィールドがあるか → create処理で値を渡しているか → スキーマ外データ（linkCustomData, businessId等）は`.parse()`前に取り出しているか → 事業選択時にBusinessLinkが自動作成されるか
2. **READ（GET一覧）**: 新フィールドがselectに含まれるか → フォーマッターで正しく返るか
3. **READ（GET詳細）**: 同上 → 詳細画面に表示されるか
4. **UPDATE（PATCH）**: スキーマ外のフィールドは明示的に取り出しているか → マージ更新で既存値が消えないか
5. **インライン編集**: customPatchのbody生成 → API側の受け取り → 必要な付帯情報（businessId等）が欠落していないか
6. **フォーム編集**: unflattenDotKeysの変換 → APIへの送信 → 必要な付帯情報が含まれるか
7. **CSVエクスポート**: 一覧に絞り込みを追加したら、CSV APIでも同じ条件が効くか。**一覧APIとCSV APIは絞り込みロジックを共有すること**（`src/lib/project-filters.ts` / `src/lib/master-filters.ts`）。別々に `searchParams` を読むと「画面では絞れるがCSVは全件」になる

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
- **ダブルクリック編集**: `ColumnDef.doubleClickToEdit` + `singleClickHref` でリンク列（顧客名・代理店名）をシングルクリック→**別タブで開く** / ダブルクリック→編集に対応。250ms遅延タイマーでダブルクリック検出時に `window.open` をキャンセル。同一タブ遷移にすると一覧の絞り込み・列固定が失われるため `router.push` は使わないこと
- **通常PATCH**: `patchEndpoint` に `?businessId=X` クエリパラメータを付与（レスポンスで事業別データも展開するため）
- **フォームPATCH**: `config.extraSubmitData` で付帯情報を自動マージ
- **PATCHレスポンス整合性**: GETで返す全フィールドをPATCHレスポンスにも含めること（行全体置換でデータ消失防止）。特に案件PATCHではクロスエンティティのフラット展開フィールド（`customerName`, `customerVersion`, `partnerName`, `partnerVersion`等）を明示的に返す必要がある（`formatProject`だけではネスト構造のみで不足）
- **子エンティティPATCH**: 連絡先等の子テーブルPATCHレスポンスは親行と別スキーマ。行置換せず一覧invalidate（`isSameEntity`判定）
- **クロスエンティティキャッシュ**: 案件一覧から顧客/代理店を編集時、顧客/代理店の詳細・一覧キャッシュも無効化
- **Zodスキーマ外フィールド**: `body.xxx` で手動取り出し → マージ更新（POST/PATCH共通パターン）
- **新規作成時の事業リンク**: 顧客・代理店POST APIで `businessId` がある場合、自動的に `CustomerBusinessLink` / `PartnerBusinessLink` を作成。`linkCustomData` がある場合はカスタムデータも同時保存
- **楽観的ロック**: `version: { increment: 1 }` + 409 Conflict
- **手数料の凍結**: 収益確定時に実効料率を案件へ焼き付ける（下記「会計（手数料）の2系統と凍結」）。バックフィルは `version` を上げない（実効値が変わらないので編集中ユーザーに409を出す理由が無い）
- **ドット記法**: `unflattenDotKeys` / `flattenNestedToFormKeys` で変換

### 会計（手数料）の2系統と凍結

向きの違う2種類の手数料を扱う。混同すると粗利が逆側にズレるので、画面のラベルも必ず区別すること。

| | 意味 | 解決レイヤー（後勝ち） | 保存先 |
|---|---|---|---|
| **自社受取率** `CompanyShare` | メーカー → 自社。取扱高のうち自社売上になる分 | 事業デフォルト → **1次代理店** → 案件別上書き | `rewardConfig.companyShare` / `PartnerBusinessLink.companyShareSlots` / `Project.companyShareOverride` |
| **代理店支払手数料** `RewardSlots` | 自社 → 代理店 | 事業デフォルト → 代理店リンク → 案件別上書き | `rewardConfig.defaults` / `PartnerBusinessLink.rewardSlots` / `Project.rewardOverride` |

- **受取率は「代理店グループ単位」**。メーカーとの手数料は1次代理店との契約で決まるため、案件の担当が2次・3次でも階層を最上位まで遡って**1次代理店の値**を使う（`resolveTopPartnerCompanyShare`）。途中の段の設定は参照しない
- **受取率を保存できるのは1次代理店のリンクだけ**。2次以降に書けると「入力したのに効かない設定」が残るため、`validateCompanyShareTier` で API 入口から弾き、1次から降格したときは値をクリアする
- **P/L の表示判定は事業デフォルトだけで見ない**。`isCompanyShareUsedInBusiness` で代理店リンク・案件上書き・スナップショットまで見る。デフォルト未設定でも代理店別に設定している事業があるため

#### 収益確定のラッチ（どこで発火するか）

`revenueConfirmedAt` のセットと凍結は2箇所で行う。**片方だけに足すと取りこぼす**。

| 経路 | 実装 |
|---|---|
| `PATCH /projects/[id]` | ルート内にインライン。手動の日付訂正・確定解除・管理者によるスナップショット訂正まで扱う |
| 新規作成 POST / CSV取り込み | `latchRevenueConfirmation`（`src/lib/revenue-confirm-latch.ts`）を書き込み後に呼ぶ |

- **作成系にラッチが無いと永久に未確定のまま残る**。実際に本番で CSV 取り込み由来の5件を取りこぼしていた（2026-08-19に修復）。`/api/v1/rewards/warnings` は検出するだけの安全網で、人が見て直す前提
- ラッチはトランザクションの外で呼ぶ。スナップショットの組み立てが事業設定・代理店階層を読むため、案件が確定済みで存在している必要がある
- CSVのドライランは中身をロールバックするので対象外
- 確定日は `projectStatusChangedAt`（＝そのステータスになった月を計上月にする）。PATCH 経由と揃えている
- `version` は上げない。呼び出し元が直前に更新しており、二重に上がるため
- `batch` ルートは論理削除のみでステータスを変えないのでラッチ不要

#### 収益確定時の凍結（RewardSnapshot）

`revenueConfirmedAt` が **null → 非null** になった瞬間、その時点の実効料率を `Project.rewardSnapshot` へ丸ごと焼き付ける。

- **凍結する**: 自社受取率 / 階層各段の支払率 / 基準金額フィールド / 支払タイミング
- **凍結しない**: 取扱高そのもの（金額の入力ミスは直したら直ってほしい）/ 消費税率（明細書単位で小計に掛かるため案件ごとに持たせても合成できない）
- 凍結済み案件は**マスタも案件別上書きも参照しない**。訂正はスナップショットを直接編集する（案件詳細の報酬タブ・**管理者のみ**）
- 確定解除（null 化）でスナップショットも消え、再確定で最新料率を取り込み直せる
- 凍結後に階層へ新しい段が現れた場合、その段だけマスタから解決する（`snapshotNodeFor` が undefined を返す）。実在しない代理店に払い続けないため
- **受取と支払はセットで凍結する**。片方だけ凍結すると粗利＝受取−支払が結局動き、発行済み明細（`RewardEntry` は率・金額を保存済み）と画面の粗利が食い違う
- 既存の確定済み案件は `POST /api/v1/admin/backfill-reward-snapshots`（管理者・冪等・`dryRun` 可）で一括付与。実行時点の実効値を焼くので前後で金額は変わらない

解決の入口は `resolveEffectiveCompanyShare` / `settingForNode` / `effectiveRewardBaseField` / `effectiveCompanyShareBaseField` に集約されている。**料率を読む新しいコードはこれらを経由すること**（`config.shotBaseField` を直接読むと凍結が効かない）。`tests/lib/reward-snapshot.test.ts` に検証あり。

### 一覧の状態管理（EntityListTemplate）

- **URLが正**: 絞り込み・検索・ソート・ページ・表示件数・**選択中のビューID（`?view=`）** を `useEntityList` がURLに同期する。戻る操作・ブックマークでの復元がこれで成立する
- **デフォルトビューの自動適用**: URLに一覧状態がある場合はスキップする。適用すると戻ってきた直後にURL由来の状態を上書きしてしまうため
- **列設定のスコープ分離**: 「すべて」タブ＝グローバル設定（`user-preferences/table`）、自分のビュー＝ビューの `columnSettings`、共有ビュー＝セッション内ローカルのみ。**ビュー適用時にグローバル設定を書き換えないこと**（書き換えると「すべて」タブがビューの列構成に固定される）
- **「すべて」タブは全列強制表示**: `SpreadsheetTable` の `forceAllColumnsVisible` で `defaultVisible: false` も含め全列を表示し、非表示操作を受け付けない。CSVの対象列・ビュー新規保存時の初期状態も全列に揃える
- **デバウンス保存はunmountでフラッシュ**: `useTablePreferences` / `useSavedViews.updateViewSettings` は1秒デバウンス。クリーンアップで `clearTimeout` だけすると、列固定直後に画面遷移した場合に保存が消える
- **列設定のZodスキーマは共有する**: グローバル設定（`user-preferences/table`）と保存済みビュー（`saved-views` POST/PATCH）は同じ `PersistedColumnSettings` を保存する。スキーマを各ルートに書くと片方への追加を忘れ、**zodが未定義キーを黙って削除する**（保存レスポンスでキャッシュが上書きされ「設定した瞬間に元に戻る」）。定義は `src/lib/table-settings-schema.ts` に集約し、`tests/lib/table-settings-schema.test.ts` にドリフト検知あり
- **列設定の保存は「読み込み中」だけスキップ**: `preferences === null` は「未ロード」ではなく「保存レコード未作成」も含む。`if (!preferences) return` にすると新規ユーザーは列固定・列幅・列順を永久に保存できない。ロード完了フラグで判定する（`SpreadsheetTable` の `preferencesReady`）
- **パンくず `?from=`**: `buildFromParam(label, fallbackPath)` で生成し、遷移時点の `location.search` を含める。値は必ずURLエンコードし、ラベルは「最後のカンマ以降」で切り出す（クエリ内にカンマが入るため）。`Link href` での使用はSSRとのhydration不一致になるのでイベントハンドラ内でのみ使う

### 一覧APIとCSVエクスポートAPIの絞り込み共有

一覧とCSVで別々に `searchParams` を読むと、**「画面では絞り込めるがCSVは全件」**という不一致が必ず発生する。絞り込みロジックは共通モジュールに集約すること。

| エンティティ | 共通モジュール | 関数 |
|-------------|--------------|------|
| 案件 | `src/lib/project-filters.ts` | `applyProjectListFilters` / `matchesCustomFieldFilters` |
| 顧客・代理店 | `src/lib/master-filters.ts` | `buildCustomerListWhere` / `buildPartnerListWhere` |

- **ロール別スコープは共通モジュールに含めない**。API ごとに要件が違うため呼び出し側の責務とする
- **適用順は「絞り込み → ロールスコープ」**。逆にするとユーザー指定の `filter[projectAssignedUserId]` 等でスコープを上書きできてしまう（実際に権限の穴になっていた）
- **カスタムフィールド絞り込み**はJSONカラムのためPrismaでは絞れない。取得後に `matchesCustomFieldFilters` でアプリ側フィルターを両APIに適用する
- `tests/lib/project-filters.test.ts` / `tests/lib/master-filters.test.ts` に**ドリフト検知**あり。ルート内で `searchParams.get('filter[...]')` を直接読むとテストが落ちる

## 技術スタック

- Next.js 14 App Router + TypeScript
- Prisma + PostgreSQL
- TanStack Query（キャッシュは `predicate` で前方一致無効化）
- Radix UI（`<SelectItem value="">` 禁止）
- Zustand（事業スコープ管理）
