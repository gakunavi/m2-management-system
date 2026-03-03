# 共通コンポーネント設計書

## 1. 設計思想

### 1.1 現システムの課題と解決方針

| 現システムの課題 | 新システムの方針 |
|---|---|
| useProjectData, useProjectFilters等のエンティティ固有フック | useEntityList, useEntityForm等の汎用フック |
| MoList, ProjectList等で同じロジックが重複 | 設定オブジェクトを渡すだけで動作する共通List画面 |
| getOptions/renderOptionsがフォームごとに複製 | 統一フォームフィールドレンダラー |
| コントローラーごとにレスポンス構造が微妙に異なる | 統一レスポンスラッパー |
| ページコンポーネントに状態管理ロジックが密結合 | フック層で完全にロジックを分離 |

### 1.2 核心原則

**Config-Driven Architecture（設定駆動アーキテクチャ）— 80/20アプローチ**

共通基盤（データ取得・ページネーション・バリデーション・保存）は設定オブジェクトで動作する。
ただし、画面のUI表現やビジネスロジックが複雑な場合はエンティティ固有のコードを許容する。

```typescript
// 悪い例（現システム）— データ取得・フィルター・テーブル表示を全てエンティティ固有で実装
const ProjectList = () => {
  const { projects, loading } = useProjectData();
  const { filters } = useProjectFilters();
  // ... プロジェクト固有のロジック100行
};

// 良い例（新システム）— 基本パターンは設定で動作
const CustomerList = () => {
  return <EntityListPage config={customerListConfig} />;
};

// 良い例（新システム）— 複雑な画面はエンティティ固有コンポーネントを許容
const ProjectList = () => {
  const listState = useEntityList(projectListConfig); // 共通フックでデータ取得
  return (
    <EntityListTemplate {...listState} config={projectListConfig}>
      {/* 案件固有: ステータス連動の警告表示 */}
      <ProjectStatusWarnings data={listState.data} />
    </EntityListTemplate>
  );
};
```

#### Config-Drivenの適用範囲

| レイヤー | 共通基盤（Config必須） | エンティティ固有コード（許容） |
|---------|---------------------|--------------------------|
| **データ取得** | useEntityList, useEntityDetail, useEntityForm | — |
| **ページネーション** | 統一ページネーション | — |
| **検索・フィルター** | SearchInput, FilterPanel | — |
| **テーブル表示** | DataTable + ColumnDef | カスタムrender関数 |
| **バリデーション** | Zodスキーマ + 統一エラー表示 | — |
| **保存・更新** | apiClient.create/update | — |
| **楽観的ロック** | version自動チェック（共通） | — |
| **フォームUI** | FormField + FormSectionDef | 複雑な連動ロジック用の固有コンポーネント |
| **フォーム送信前処理** | 統一バリデーション → submit | エンティティ固有のデータ変換 |
| **詳細画面タブ** | TabLayout + 標準タブ種別 | component="custom" で固有UI |

**原則:**
- **共通フック（useEntityList等）は必ず使う** — データ取得・状態管理を自前で書かない
- **設定オブジェクトで表現できる範囲は設定で書く** — columns, filters, sections等
- **設定で表現が困難な複雑UIは固有コンポーネントを許容** — ただし共通フックの上に構築する
- **新エンティティ追加時、80%以上のコードは設定ファイルのみ** — 固有コードは必要な場合だけ

---

## 2. アーキテクチャ層

```
┌──────────────────────────────────────────────┐
│                ページ層                        │
│  CustomerListPage, ProjectDetailPage, ...     │
│  → 設定オブジェクトを渡すだけ                   │
├──────────────────────────────────────────────┤
│              テンプレート層                     │
│  EntityListTemplate, EntityDetailTemplate,    │
│  EntityFormTemplate                           │
│  → 画面パターンの骨格                          │
├──────────────────────────────────────────────┤
│              共通フック層                       │
│  useEntityList, useEntityDetail,              │
│  useEntityForm, useEntityExport,              │
│  useTablePreferences, useInlineCellEdit       │
│  → ビジネスロジック                            │
├──────────────────────────────────────────────┤
│            UIコンポーネント層                   │
│  DataTable, SpreadsheetTable, FormField,      │
│  EditableCell, CellEditor, Modal,             │
│  ColumnSettingsPanel, StatusBadge,            │
│  StatisticsCard, SearchFilter, Pagination     │
│  → 再利用可能なUIパーツ                        │
├──────────────────────────────────────────────┤
│               API層                           │
│  apiClient (統一HTTPクライアント)               │
│  → レスポンス変換、エラーハンドリング            │
└──────────────────────────────────────────────┘
```

---

## 3. 設定オブジェクト（Config）の設計

### 3.1 EntityListConfig

一覧画面を定義する設定オブジェクト。

```typescript
type EntityListConfig = {
  // 基本情報
  entityType: string;              // "customer" | "partner" | "project"
  apiEndpoint: string;             // "/api/v1/customers"
  title: string;                   // "顧客一覧"

  // テーブル列定義
  columns: ColumnDef[];

  // 検索設定
  search: {
    placeholder: string;           // "顧客名、コードで検索"
    fields: string[];              // APIに渡す検索対象フィールド
    debounceMs?: number;           // デバウンス時間（デフォルト: 300ms）
  };

  // フィルター定義
  filters: FilterDef[];

  // クイックフィルター（チェックボックス式の即時フィルター）
  // > **未実装**: Phase 2 以降で実装予定
  quickFilters?: QuickFilterDef[];

  // ソートデフォルト（単一または複数列ソート）
  defaultSort:
    | { field: string; direction: "asc" | "desc" }
    | { field: string; direction: "asc" | "desc" }[];

  // 統計・分析設定（任意）
  // > **未実装**: Phase 2 以降で実装予定
  analytics?: {
    statistics?: StatisticsDef[];       // 統計カード定義
    charts?: ChartDef[];               // グラフ定義（棒/円/折れ線）
    periodSelector?: boolean;          // 期間選択UIを表示するか
    defaultPeriod?: "all" | "month" | "quarter" | "year";
  };

  // テーブル表示設定
  tableSettings: {
    persistKey: string;                // サーバー保存用のキー（例: "customer_list"）
    defaultPageSize: 10 | 25 | 50 | 100;
    defaultDensity: "compact" | "normal" | "comfortable";
    columnReorderEnabled: boolean;     // 列の並び替え（ドラッグ&ドロップ）
    columnToggleEnabled: boolean;      // 列の表示/非表示切り替え
  };

  // 行クリック時の遷移先
  detailPath: (id: number) => string;

  // 新規作成パス（省略時は新規作成ボタン非表示）
  createPath?: string;

  // CSV設定（任意）
  csv?: {
    importEnabled: boolean;
    exportEnabled: boolean;
    endpoint: string;                  // CSVエクスポート/テンプレートのAPIエンドポイント
  };

  // アクセス制御
  permissions?: {
    // > **未実装**: hideAnalytics, disableLinks は Phase 2 以降で実装予定
    hideAnalytics?: string[];          // これらのロールでは統計・グラフ非表示
    disableLinks?: string[];           // これらのロールではリンクをテキスト表示
    hideCreateButton?: string[];       // 新規作成ボタンを非表示
  };

  // 事業フィルター（案件等の事業レベルエンティティ用）
  businessScoped?: boolean;

  // 一括操作（チェックボックス選択 + バッチアクション）
  batchActions?: BatchActionDef[];

  // インライン編集モード（trueでSpreadsheetTableを使用）
  inlineEditable?: boolean;

  // インライン編集用PATCHエンドポイント
  patchEndpoint?: (id: number) => string;
};

// テーブル列定義（インライン編集対応）
type ColumnDef = {
  key: string;
  label: string;
  width?: number;
  minWidth?: number;
  sortable?: boolean;
  align?: "left" | "center" | "right";
  render?: (value: any, row: any) => ReactNode;  // カスタム表示

  // インライン編集設定（省略時は編集不可）
  editable?: {
    type: "text" | "number" | "select" | "date" | "month" | "multiline";
    options?: { value: string; label: string }[];  // select型の場合
    optionsEndpoint?: string;                       // 動的選択肢
    saveEndpoint?: (row: any) => string;           // 保存先API（省略時はエンティティの更新API）
    saveField?: string;                             // 保存するフィールド名（keyと異なる場合）
  };

  // 表示制御
  defaultVisible?: boolean;          // デフォルトで表示するか（true）
  locked?: boolean;                  // 非表示にできない列か

  // SpreadsheetTable用インライン編集設定（省略時は読み取り専用）
  edit?: CellEditConfig;
};

// セルエディタの型種別と設定（SpreadsheetTable用）
type CellEditConfig = {
  type: CellEditorType;              // 入力UIの種別
  options?: { value: string; label: string }[];  // select型の選択肢
  optionsEndpoint?: string;          // master-select用：マスタ選択肢の取得API
  labelField?: string;               // master-select用：表示ラベルに使うフィールド名
  validate?: (value: unknown) => { success: boolean; error?: string };  // セル単位バリデーション
  placeholder?: string;              // プレースホルダーテキスト
};

type CellEditorType =
  | "text"           // テキスト入力
  | "number"         // 数値入力
  | "select"         // セレクトボックス（静的選択肢）
  | "master-select"  // マスタセレクト（APIからマスタ選択肢を動的取得）
  | "date"           // 日付ピッカー
  | "month"          // 月ピッカー
  | "email"          // メール入力
  | "phone"          // 電話番号入力
  | "url"            // URL入力
  | "textarea"       // 複数行テキスト
  | "checkbox";      // チェックボックス（クリックで即トグル）

// フィルター定義（判別共用体型）
// 9種類のフィルタータイプをサポート。選択肢の取得方法は静的（options）と動的（optionsEndpoint）の排他的指定。
type FilterDefBase = {
  key: string;
  label: string;
};

type FilterOptionSource =
  | { options: { value: string; label: string }[]; optionsEndpoint?: never }
  | { options?: never; optionsEndpoint: string };

type SelectFilterDef = FilterDefBase & { type: 'select' } & FilterOptionSource;
type MultiSelectFilterDef = FilterDefBase & { type: 'multi-select'; maxSelections?: number } & FilterOptionSource;
type TextFilterDef = FilterDefBase & { type: 'text'; placeholder?: string; debounceMs?: number };
type DateRangeFilterDef = FilterDefBase & { type: 'date-range' };
type NumberRangeFilterDef = FilterDefBase & { type: 'number-range'; unit?: string; min?: number; max?: number; step?: number };
type BooleanFilterDef = FilterDefBase & { type: 'boolean'; trueLabel?: string; falseLabel?: string };
type CheckboxGroupFilterDef = FilterDefBase & { type: 'checkbox-group' } & FilterOptionSource;
type DateFilterDef = FilterDefBase & { type: 'date' };
type MonthFilterDef = FilterDefBase & { type: 'month' };

export type FilterDef =
  | SelectFilterDef | MultiSelectFilterDef | TextFilterDef
  | DateRangeFilterDef | NumberRangeFilterDef | BooleanFilterDef
  | CheckboxGroupFilterDef | DateFilterDef | MonthFilterDef;

// --- フィルターユーティリティ ---
//
// フィルター値はすべて `Record<string, string>` 形式でURLクエリパラメータにシリアライズされる。
// 複合値（multi-select, date-range, number-range）は専用のシリアライズ関数で文字列に変換する。
//
// ■ クライアント側: src/lib/filter-utils.ts
//   - serializeMultiValue(values: string[]): string   — カンマ区切り（例: "法人,個人"）
//   - deserializeMultiValue(value: string): string[]
//   - serializeRange(from: string, to: string): string — チルダ区切り（例: "2026-01-01~2026-12-31"）
//   - deserializeRange(value: string): { from: string; to: string }
//
// ■ API側: src/lib/filter-helper.ts（Prisma where句ビルダー）
//   - getFilterParam(searchParams, key): string | null
//   - parseMultiValue(value: string): string[]
//   - parseRange(value: string): { from: string; to: string }
//   - whereEquals(field, value): Prisma where条件
//   - whereIn(field, value): Prisma where条件（multi-select用）
//   - whereContains(field, value): Prisma where条件（text部分一致用）
//   - whereDateRange(field, value): Prisma where条件（date-range用）
//   - whereNumberRange(field, value): Prisma where条件（number-range用）
//   - whereBoolean(field, value): Prisma where条件（boolean用）

// クイックフィルター（営業ステータス等のチェックボックス式フィルター）
// > **未実装**: Phase 2 以降で実装予定
type QuickFilterDef = {
  key: string;
  label: string;
  options: { value: string; label: string; color?: string }[];
  defaultSelected?: string[];        // デフォルトで選択されている値
  apiFilter: boolean;                // trueならAPIパラメータとして送信、falseならフロント側フィルター
};

// 一括操作定義
type BatchActionDef = {
  key: string;                         // "delete" | "changeStatus" | "assignUser" | "export"
  label: string;                       // "一括削除", "ステータス一括変更"
  icon?: string;                       // アイコン名
  variant?: "default" | "destructive"; // 破壊的操作は赤色表示
  // 実行前の確認ダイアログ
  confirm?: {
    title: string;
    message: string | ((count: number) => string);
  };
  // 追加入力が必要な場合（例: ステータス変更先の選択）
  inputConfig?: {
    type: "select" | "text" | "user_select";
    label: string;
    optionsEndpoint?: string;
  };
  // 実行API
  apiEndpoint: string;                 // POST /api/v1/projects/batch/{key}
  // 実行後の動作
  onComplete?: "refresh" | "redirect"; // デフォルト: refresh
  // 権限制御
  requiredRole?: string[];             // この操作を実行できるロール
};

// グラフ定義
type ChartDef = {
  type: "bar" | "pie" | "line";
  dataEndpoint: string;
  title: string;
  xField?: string;
  yField?: string;
  groupField?: string;
};
```

**使用例:**

```typescript
// config/entities/customer.ts
export const customerListConfig: EntityListConfig = {
  entityType: "customer",
  apiEndpoint: "/api/v1/customers",
  title: "顧客一覧",
  columns: [
    { key: "customerCode", label: "顧客コード", width: 120, sortable: true, locked: true },
    { key: "customerName", label: "顧客名", width: 200, sortable: true, locked: true },
    { key: "industryId", label: "業種", width: 150, sortable: false,
      render: (_value, row) => row.industry?.industryName ?? '-' },
    { key: "customerAntisocialCheckStatus", label: "反社チェック", width: 100,
      render: (value) => <StatusBadge status={value} />,
      editable: { type: "select", options: [
        { value: "確認済み", label: "確認済み" },
        { value: "未確認", label: "未確認" },
        { value: "確認中", label: "確認中" },
      ] } },
    { key: "projectCount", label: "案件数", width: 80, align: "right" },
  ],
  search: {
    placeholder: "顧客名、コードで検索",
    fields: ["customerName", "customerCode"],
  },
  filters: [
    { key: 'customerType', label: '種別', type: 'multi-select',
      options: CUSTOMER_TYPE_OPTIONS },
    { key: 'industryId', label: '業種', type: 'multi-select',
      optionsEndpoint: '/customers/filter-options' },
    { key: 'isActive', label: '状態', type: 'boolean',
      trueLabel: '有効', falseLabel: '無効（削除済み）' },
    { key: 'customerAddress', label: '住所', type: 'text',
      placeholder: '住所キーワード...' },
    { key: 'createdAt', label: '作成日', type: 'date-range' },
    { key: 'customerCapital', label: '資本金', type: 'number-range',
      unit: '円', min: 0 },
    { key: 'customerEstablishedDate', label: '設立日', type: 'date-range' },
  ],
  defaultSort: { field: "customerCode", direction: "asc" },
  tableSettings: {
    persistKey: "customer_list",
    defaultPageSize: 25,
    defaultDensity: "normal",
    columnReorderEnabled: true,
    columnToggleEnabled: true,
  },
  detailPath: (id) => `/customers/${id}`,
  createPath: "/customers/new",
  csv: { importEnabled: true, exportEnabled: true,
    endpoint: "/api/v1/customers/csv" },
};

// config/entities/project.ts（案件 - より複雑な例）
export const projectListConfig: EntityListConfig = {
  entityType: "project",
  apiEndpoint: "/api/v1/projects",
  title: "案件一覧",
  businessScoped: true,
  columns: [
    { key: "projectNo", label: "案件番号", width: 120, sortable: true, locked: true },
    { key: "customerName", label: "顧客名", width: 180, sortable: true },
    { key: "projectSalesStatus", label: "営業ステータス", width: 140,
      render: (value) => <StatusBadge status={value} />,
      editable: { type: "select", optionsEndpoint: "/api/v1/businesses/:businessId/statuses" } },
    { key: "projectAmount", label: "金額", width: 120, align: "right",
      render: (value) => formatCurrency(value),
      editable: { type: "number" } },
    { key: "projectNotes", label: "備考", width: 200,
      editable: { type: "multiline" } },
  ],
  search: { placeholder: "案件番号、顧客名で検索", fields: ["projectNo", "customerName"] },
  filters: [
    { key: "partnerId", label: "代理店", type: "select",
      optionsEndpoint: "/api/v1/partners/options" },
    { key: "projectAssignedUserName", label: "担当者", type: "text" },
    { key: "expectedCloseDate", label: "受注予定月", type: "month" },
  ],
  quickFilters: [
    {
      key: "projectSalesStatus",
      label: "営業ステータス",
      apiFilter: true,
      options: [
        { value: "6.アポ中", label: "アポ中", color: "#94a3b8" },
        { value: "5.Bヨミ", label: "Bヨミ", color: "#60a5fa" },
        { value: "4.Aヨミ(申請中)", label: "Aヨミ", color: "#fbbf24" },
        { value: "3.契約締結中", label: "契約締結中", color: "#f97316" },
        { value: "2.入金確定", label: "入金確定", color: "#34d399" },
        { value: "1.購入済み", label: "購入済み", color: "#22c55e" },
        { value: "7.失注", label: "失注", color: "#ef4444" },
      ],
      defaultSelected: ["6.アポ中", "5.Bヨミ", "4.Aヨミ(申請中)", "3.契約締結中", "2.入金確定"],
    },
  ],
  analytics: {
    statistics: [
      { key: "totalActive", label: "全案件数", type: "count", excludeStatuses: ["7.失注"] },
      { key: "totalAmount", label: "総売上", type: "sum", field: "projectAmount", format: "currency" },
      { key: "avgAmount", label: "平均売上", type: "average", field: "projectAmount", format: "currency" },
    ],
    charts: [
      { type: "bar", title: "ステータス別件数", dataEndpoint: "/api/v1/projects/chart/status",
        xField: "status", yField: "count" },
      { type: "pie", title: "ステータス別金額", dataEndpoint: "/api/v1/projects/chart/status-amount",
        groupField: "status" },
    ],
    periodSelector: true,
    defaultPeriod: "all",
  },
  defaultSort: { field: "projectNo", direction: "desc" },
  tableSettings: {
    persistKey: "project_list",
    defaultPageSize: 25,
    defaultDensity: "normal",
    columnReorderEnabled: true,
    columnToggleEnabled: true,
  },
  detailPath: (id) => `/projects/${id}`,
  createPath: "/projects/new",
  csv: { importEnabled: true, exportEnabled: true,
    endpoint: "/api/v1/projects/csv" },
  permissions: {
    hideAnalytics: ["partner"],
    disableLinks: ["partner"],
  },
  batchActions: [
    {
      key: "changeStatus",
      label: "ステータス一括変更",
      icon: "ArrowUpDown",
      confirm: {
        title: "ステータス一括変更",
        message: (count) => `${count}件の案件のステータスを変更します。よろしいですか？`,
      },
      inputConfig: {
        type: "select",
        label: "変更先ステータス",
        optionsEndpoint: "/api/v1/businesses/:businessId/statuses",
      },
      apiEndpoint: "/api/v1/projects/batch/change-status",
    },
    {
      key: "assignUser",
      label: "担当者一括変更",
      icon: "UserCheck",
      confirm: {
        title: "担当者一括変更",
        message: (count) => `${count}件の案件の担当者を変更します。`,
      },
      inputConfig: {
        type: "user_select",
        label: "変更先担当者",
        optionsEndpoint: "/api/v1/users/options",
      },
      apiEndpoint: "/api/v1/projects/batch/assign-user",
    },
    {
      key: "delete",
      label: "一括削除",
      icon: "Trash2",
      variant: "destructive",
      confirm: {
        title: "一括削除",
        message: (count) => `${count}件の案件を削除します。この操作は元に戻せません。`,
      },
      apiEndpoint: "/api/v1/projects/batch/delete",
      requiredRole: ["admin"],
    },
  ],
};
```

### 3.2 EntityDetailConfig

詳細画面を定義する設定オブジェクト。

```typescript
type EntityDetailConfig = {
  entityType: string;
  apiEndpoint: (id: string) => string;
  title: (data: any) => string;     // 動的タイトル

  // タブ定義
  tabs: TabDef[];

  // ヘッダーアクション
  actions: {
    edit: boolean;
    delete: boolean;
    custom?: ActionDef[];          // カスタムボタン（営業ステータス変更等）
  };

  // データ整合性の警告ルール（条件に該当すると黄色バナーで警告表示）
  warnings?: WarningRule[];

  // アクセス制御
  permissions?: {
    hideActions?: string[];        // これらのロールではアクション非表示
    hideTabs?: Record<string, string[]>;  // タブごとの非表示ロール
  };
};

type TabDef = {
  key: string;
  label: string;
  // タブ種別ごとに最適なレンダリングを行う
  component: "info" | "related" | "contacts" | "movements" | "files" | "custom";
  config: InfoTabConfig | RelatedTabConfig | ContactsTabConfig
        | MovementTabConfig | FileTabConfig | CustomTabConfig;
};

type InfoTabConfig = {
  sections: {
    title: string;
    columns?: 1 | 2;              // セクション内の列数（デフォルト2）
    fields: FieldDisplayDef[];
  }[];
};

type FieldDisplayDef = {
  key: string;
  label: string;
  type?: "text" | "number" | "currency" | "date" | "email" | "phone"
       | "url" | "address" | "image" | "file" | "status" | "boolean";
  colSpan?: 1 | 2;               // 2列レイアウトで全幅表示する場合
  render?: (value: any, data: any) => ReactNode;  // カスタム表示
  // 画像型の場合: サムネイル表示 + クリックでプレビュー + ダウンロードボタン
  imageConfig?: {
    thumbnailSize?: number;       // サムネイルサイズ(px)
    previewable?: boolean;        // クリックプレビュー
    downloadable?: boolean;       // ダウンロードボタン
  };
};

// 担当者タブ（子エンティティの一覧表示 + 名刺画像プレビュー対応）
type ContactsTabConfig = {
  apiEndpoint: (parentId: string) => string;
  columns: ColumnDef[];
  showBusinessCardPreview?: boolean;  // 名刺画像のインラインプレビュー
  // 事業別担当者フィルター（顧客担当者で使用）
  businessFilter?: {
    enabled: boolean;                 // 事業フィルターを表示するか
    showAll?: boolean;                // 「全事業」タブも表示するか（デフォルト: true）
  };
};

// 関連エンティティタブ（同一顧客の他案件など）
type RelatedTabConfig = {
  apiEndpoint: (parentId: string) => string;
  columns: ColumnDef[];
  detailPath?: (id: number) => string;  // 行クリックで遷移
  showCount?: boolean;                   // タブラベルに件数表示
};

// ムーブメントタブ
type MovementTabConfig = {
  apiEndpoint: (projectId: string) => string;
  enableStatusChange?: boolean;          // ステータス変更ボタン表示
  showTimeline?: boolean;                // タイムライン表示
};

// ファイルタブ
type FileTabConfig = {
  apiEndpoint: (parentId: string) => string;
  categories: { value: string; label: string }[];
  uploadEnabled: boolean;
  previewEnabled: boolean;               // ファイルプレビュー（新タブで開く）
  downloadEnabled: boolean;
  maxFileSize?: number;                  // MB
  acceptTypes?: string[];                // MIMEタイプ
};

// 警告ルール（データ不整合の検知と表示）
type WarningRule = {
  condition: (data: any) => boolean;     // trueで警告表示
  message: string | ((data: any) => string);
  severity: "warning" | "info";
};
```

**使用例:**

```typescript
export const customerDetailConfig: EntityDetailConfig = {
  entityType: "customer",
  apiEndpoint: (id) => `/api/v1/customers/${id}`,
  title: (data) => data.customerName,
  tabs: [
    {
      key: "info",
      label: "基本情報",
      component: "info",
      config: {
        sections: [
          {
            title: "会社情報",
            columns: 2,
            fields: [
              { key: "customerCode", label: "顧客コード" },
              { key: "customerName", label: "顧客名" },
              { key: "customerRepresentativeName", label: "代表者名" },
              { key: "industryId", label: "業種", render: (_value, data) => data.industry?.industryName ?? '-' },
              { key: "customerPhone", label: "電話番号", type: "phone" },
              { key: "customerEmail", label: "メールアドレス", type: "email" },
              { key: "customerAddress", label: "住所", type: "address", colSpan: 2 },
              // 名刺画像: サムネイル + プレビュー + ダウンロード
              { key: "representativeBusinessCard", label: "代表者名刺", type: "image",
                imageConfig: { thumbnailSize: 120, previewable: true, downloadable: true } },
            ],
          },
          {
            title: "企業情報",
            columns: 2,
            fields: [
              { key: "customerEmployeeCount", label: "従業員数", type: "number" },
              { key: "customerCapital", label: "資本金", type: "currency" },
              { key: "customerAnnualRevenue", label: "年商", type: "currency" },
            ],
          },
        ],
      },
    },
    {
      key: "contacts",
      label: "担当者",
      component: "contacts",
      config: {
        apiEndpoint: (id) => `/api/v1/customers/${id}/contacts`,
        columns: [
          { key: "contactName", label: "担当者名", width: 150 },
          { key: "contactDepartment", label: "部署", width: 120 },
          { key: "contactPosition", label: "役職", width: 100 },
          { key: "contactPhone", label: "電話番号", width: 130 },
          { key: "contactEmail", label: "メール", width: 180 },
          { key: "businessName", label: "事業", width: 100,
            render: (v) => v || "全事業共通" },
        ],
        showBusinessCardPreview: true,
        // 事業別フィルター: タブで「全て / MOAG事業 / サービスA事業」を切り替え
        businessFilter: { enabled: true, showAll: true },
      },
    },
    {
      key: "businessData",
      label: "事業別情報",
      component: "custom",
      // 事業ごとのカスタムフィールドを表示（customer_business_linksのlink_custom_data）
      // 事業タブで切り替え、business_configのcustomerFieldsに基づいて動的レンダリング
      config: {
        render: "BusinessCustomDataPanel",
        apiEndpoint: (id) => `/api/v1/customers/${id}/business-links`,
      },
    },
    {
      key: "projects",
      label: "関連案件",
      component: "related",
      config: {
        apiEndpoint: (id) => `/api/v1/customers/${id}/projects`,
        columns: [
          { key: "projectNo", label: "案件番号", width: 120 },
          { key: "projectSalesStatus", label: "ステータス", width: 130,
            render: (v) => <StatusBadge status={v} /> },
          { key: "projectAmount", label: "金額", width: 100, align: "right",
            render: (v) => formatCurrency(v) },
        ],
        detailPath: (id) => `/projects/${id}`,
        showCount: true,
      },
    },
    {
      key: "files",
      label: "ファイル",
      component: "files",
      config: {
        apiEndpoint: (id) => `/api/v1/customers/${id}/files`,
        categories: [
          { value: "contract", label: "契約書" },
          { value: "business_card", label: "名刺" },
          { value: "other", label: "その他" },
        ],
        uploadEnabled: true,
        previewEnabled: true,
        downloadEnabled: true,
        maxFileSize: 10,
        acceptTypes: ["application/pdf", "image/*"],
      },
    },
  ],
  actions: { edit: true, delete: true },
};

// 案件詳細（警告ルール付き）
export const projectDetailConfig: EntityDetailConfig = {
  entityType: "project",
  apiEndpoint: (id) => `/api/v1/projects/${id}`,
  title: (data) => `${data.projectNo} - ${data.customerName}`,
  warnings: [
    {
      // ステータスが「購入済み」なのに入金日が未設定
      condition: (data) =>
        data.projectSalesStatus === "1.購入済み"
        && !data.projectActualCloseDate,
      message: "ステータスが「購入済み」ですが、受注日が設定されていません",
      severity: "warning",
    },
    {
      // 受注予定日を過ぎている案件
      condition: (data) =>
        data.projectExpectedCloseDate
        && new Date(data.projectExpectedCloseDate) < new Date()
        && !["1.購入済み", "7.失注"].includes(data.projectSalesStatus),
      message: (data) => `受注予定日（${data.projectExpectedCloseDate}）を超過しています`,
      severity: "warning",
    },
  ],
  tabs: [/* ... 基本情報、顧客情報、代理店情報、関連案件、ムーブメント */],
  actions: {
    edit: true,
    delete: true,
    custom: [
      { key: "changeStatus", label: "営業ステータス変更", icon: "ArrowUpDown",
        modal: "StatusChangeModal" },
    ],
  },
  permissions: {
    hideActions: ["partner"],
  },
};
```

### 3.3 EntityFormConfig

フォーム画面を定義する設定オブジェクト。
現システムの実際の複雑なフォームパターン（自動計算、連動クリア、エンティティ選択時の自動入力、子エンティティの動的追加）に対応する。

```typescript
type EntityFormConfig = {
  entityType: string;
  apiEndpoint: string;                    // POST/PUT先
  title: { create: string; edit: string };

  // フィールド定義
  sections: FormSectionDef[];

  // 子エンティティ管理（担当者リスト等）
  childEntities?: ChildEntityDef[];

  // フィールド間の自動計算ルール
  computedFields?: ComputedFieldDef[];

  // フィールド間の連動クリアルール
  cascadeRules?: CascadeRule[];

  // バリデーションスキーマ（Zod）
  validationSchema: ZodSchema;

  // 送信後の遷移先
  redirectAfterSave: (id: number) => string;

  // 離脱警告（未保存の変更がある場合）
  warnOnLeave?: boolean;
};

type FormSectionDef = {
  title: string;
  columns?: 1 | 2 | 3;                   // グリッド列数
  fields: FormFieldDef[];
  visible?: (formData: any, mode: "create" | "edit") => boolean;  // セクション全体の表示制御
};

type FormFieldDef = {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "date" | "month" | "textarea" | "email"
      | "phone" | "postal_code" | "currency" | "entity_search" | "checkbox"
      | "radio" | "file_upload" | "readonly";
  required?: boolean;
  placeholder?: string;
  disabled?: boolean | ((mode: "create" | "edit") => boolean);
  readOnly?: boolean | ((mode: "create" | "edit") => boolean);

  // 選択肢
  options?: { value: string; label: string }[];
  optionsEndpoint?: string;               // 動的選択肢取得

  // エンティティ検索（顧客選択、代理店選択等）
  entitySearchConfig?: {
    entityType: string;
    displayField: string;
    searchEndpoint: string;
    // 選択時に他のフィールドを自動入力する
    onSelectMapping?: Record<string, string>;  // { "formField": "selectedEntity.field" }
    // 選択後のカスタム処理（案件番号自動生成等）
    onSelectCallback?: string;             // コールバック名（configで定義）
  };

  // 表示制御
  visible?: (formData: any) => boolean;   // 条件付き表示
  colSpan?: 1 | 2 | 3;                   // グリッド列のスパン

  // 数値入力の追加設定
  numberConfig?: {
    min?: number;
    max?: number;
    step?: number;
    suffix?: string;                      // "台", "万円" 等
    formatAsCurrency?: boolean;           // カンマ区切り表示
  };

  // ファイルアップロードの設定
  fileConfig?: {
    accept?: string[];                    // MIMEタイプ
    maxSize?: number;                     // MB
    previewable?: boolean;
  };
};

// 自動計算フィールド（台数×単価→合計金額 等）
type ComputedFieldDef = {
  // 計算結果を設定するフィールド
  targetField: string;
  // 計算に使うフィールド群
  sourceFields: string[];
  // 計算ロジック
  compute: (values: Record<string, any>) => any;
  // 表示フォーマット（任意）
  format?: "currency" | "number" | "percent";
};

// 連動クリアルール（EXTケア加入を「×」に変更→契約期間をクリア 等）
type CascadeRule = {
  // トリガーとなるフィールド
  watchField: string;
  // トリガー条件
  condition: (value: any) => boolean;
  // クリア対象のフィールド群
  clearFields: string[];
};

// 子エンティティ管理（担当者リストの追加・削除等）
type ChildEntityDef = {
  key: string;                            // "contacts"
  label: string;                          // "担当者"
  // 既存データの取得
  apiEndpoint?: (parentId: string) => string;
  // 追加時のフィールド定義
  fields: FormFieldDef[];
  // 「既存から選択」モード
  selectExisting?: {
    searchEndpoint: string;
    displayField: string;
    // 選択時のマッピング
    onSelectMapping?: Record<string, string>;
  };
  // 表示設定
  maxItems?: number;
  addLabel?: string;                      // "担当者を追加"
  canReorder?: boolean;
};

// エンティティ選択時のカスタムコールバック定義
type EntitySelectCallbacks = {
  // MO選択時: 案件番号を自動生成
  generateProjectNo?: (selectedEntity: any, businessPrefix: string) => string;
  // その他のカスタム処理
  [key: string]: ((...args: any[]) => any) | undefined;
};
```

**使用例（案件フォーム - 最も複雑なパターン）:**

```typescript
export const projectFormConfig: EntityFormConfig = {
  entityType: "project",
  apiEndpoint: "/api/v1/projects",
  title: { create: "案件 新規作成", edit: "案件 編集" },
  warnOnLeave: true,

  sections: [
    {
      title: "基本情報",
      columns: 2,
      fields: [
        // 案件番号: 自動生成、編集不可
        { key: "projectNo", label: "案件番号", type: "readonly",
          disabled: () => true },

        // 顧客選択: 選択時に関連フィールド自動入力 + 案件番号自動生成
        // + 該当事業の担当者リストを取得（business_id付きcontactsを優先、なければ共通担当者）
        { key: "customerId", label: "顧客", type: "entity_search", required: true,
          entitySearchConfig: {
            entityType: "customer",
            displayField: "customerName",
            searchEndpoint: "/api/v1/customers/search",
            onSelectMapping: {
              "customerName": "customerName",
              "customerAddress": "address",
              "customerPhone": "phone",
            },
            onSelectCallback: "generateProjectNo",
          } },

        // 顧客担当者選択（顧客選択後に表示、事業別にフィルタリング）
        { key: "customerContactId", label: "先方担当者", type: "select",
          optionsEndpoint: "/api/v1/customers/:customerId/contacts?businessId=:businessId",
          visible: (data) => !!data.customerId },

        // 代理店選択
        { key: "partnerId", label: "代理店", type: "entity_search",
          entitySearchConfig: {
            entityType: "partner",
            displayField: "partnerName",
            searchEndpoint: "/api/v1/partners/search",
          } },

        { key: "projectSalesStatus", label: "営業ステータス", type: "select", required: true,
          optionsEndpoint: "/api/v1/businesses/:businessId/statuses" },
        { key: "projectAssignedUserName", label: "担当者", type: "text" },
        { key: "projectAssignedUserId", label: "担当ユーザー（アクセス制御用）", type: "select",
          optionsEndpoint: "/api/v1/users/options" },
        { key: "projectExpectedCloseDate", label: "受注予定日", type: "month" },
      ],
    },
    {
      title: "台数・金額情報",
      columns: 2,
      // 事業固有フィールド（MOAG事業の例）
      fields: [
        { key: "customData.normalMachineCount", label: "一般機 台数", type: "number",
          numberConfig: { min: 0, suffix: "台" } },
        { key: "customData.normalMachinePrice", label: "一般機 単価", type: "number",
          numberConfig: { min: 0, formatAsCurrency: true, suffix: "万円" } },
        // 自動計算結果（読み取り専用）
        { key: "customData.normalMachineAmount", label: "一般機 金額", type: "readonly",
          numberConfig: { formatAsCurrency: true, suffix: "万円" } },

        { key: "customData.icMachineCount", label: "IC機 台数", type: "number",
          numberConfig: { min: 0, suffix: "台" } },
        { key: "customData.icMachinePrice", label: "IC機 単価", type: "number",
          numberConfig: { min: 0, formatAsCurrency: true, suffix: "万円" } },
        { key: "customData.icMachineAmount", label: "IC機 金額", type: "readonly",
          numberConfig: { formatAsCurrency: true, suffix: "万円" } },

        // 合計（自動計算）
        { key: "customData.totalMachineCount", label: "合計台数", type: "readonly",
          numberConfig: { suffix: "台" } },
        { key: "projectAmount", label: "合計金額", type: "readonly",
          numberConfig: { formatAsCurrency: true, suffix: "万円" } },
      ],
    },
    {
      title: "EXTケア情報",
      columns: 2,
      fields: [
        { key: "customData.extCareJoined", label: "EXTケア加入", type: "select",
          options: [{ value: "○", label: "○" }, { value: "×", label: "×" }] },
        // extCareJoined が "○" の場合のみ表示
        { key: "customData.extCareContractPeriod", label: "契約期間", type: "text",
          visible: (data) => data.customData?.extCareJoined === "○" },
      ],
    },
    {
      title: "備考",
      columns: 1,
      fields: [
        { key: "projectNotes", label: "備考", type: "textarea", colSpan: 1 },
      ],
    },
  ],

  // 自動計算ルール
  computedFields: [
    {
      targetField: "customData.normalMachineAmount",
      sourceFields: ["customData.normalMachineCount", "customData.normalMachinePrice"],
      compute: (v) => (v["customData.normalMachineCount"] || 0) * (v["customData.normalMachinePrice"] || 0),
      format: "currency",
    },
    {
      targetField: "customData.icMachineAmount",
      sourceFields: ["customData.icMachineCount", "customData.icMachinePrice"],
      compute: (v) => (v["customData.icMachineCount"] || 0) * (v["customData.icMachinePrice"] || 0),
      format: "currency",
    },
    {
      targetField: "customData.totalMachineCount",
      sourceFields: ["customData.normalMachineCount", "customData.icMachineCount"],
      compute: (v) => (v["customData.normalMachineCount"] || 0) + (v["customData.icMachineCount"] || 0),
    },
    {
      targetField: "projectAmount",
      sourceFields: ["customData.normalMachineAmount", "customData.icMachineAmount"],
      compute: (v) => (v["customData.normalMachineAmount"] || 0) + (v["customData.icMachineAmount"] || 0),
      format: "currency",
    },
  ],

  // 連動クリアルール
  cascadeRules: [
    {
      watchField: "customData.extCareJoined",
      condition: (value) => value !== "○",
      clearFields: ["customData.extCareContractPeriod"],
    },
  ],

  validationSchema: projectValidationSchema,
  redirectAfterSave: (id) => `/projects/${id}`,
};
```

---

## 4. 共通フック設計

### 4.1 useEntityList

一覧画面の全ロジックを担う汎用フック。

```typescript
function useEntityList(config: EntityListConfig) {
  return {
    // データ
    data: unknown[];
    loading: boolean;
    error: Error | null;

    // ページネーション
    pagination: {
      currentPage: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
    setPage: (page: number) => void;
    setPageSize: (size: number) => void;

    // 検索
    searchQuery: string;
    setSearchQuery: (query: string) => void;

    // フィルター
    filters: Record<string, string>;
    setFilter: (key: string, value: string) => void;
    clearFilters: () => void;

    // ソート（複数列ソート対応）
    sortItems: { field: string; direction: "asc" | "desc" }[];
    setSort: (field: string) => void;      // クリックで 昇順追加 → 降順切替 → 解除
    clearSort: () => void;

    // リフレッシュ
    refresh: () => void;

    // React Query キー（関連フックとの連携用）
    queryKey: unknown[];
  };
}
```

**関連フック（責務分離）:**

以下の機能は `useEntityList` から分離され、個別のフックとして提供される。

| フック | 責務 | 参照 |
|--------|------|------|
| `useTablePreferences` | テーブル列設定のDB永続化（列順序・可視性・幅・ソート） | 4.5節 |
| `useInlineCellEdit` | インライン編集 → PATCH → 楽観的更新 | 4.7節 |

一括操作（`selectedRows`、`toggleRowSelection` 等）は `EntityListTemplate` コンポーネント内のローカル状態として管理される。

**内部実装方針:**
- TanStack Queryでサーバー状態管理
- URLパラメータとの自動同期（ページ・フィルター・ソートをURL searchParamsに保持）
- デバウンス付き検索（300ms）
- フィルター値は `Record<string, string>` 形式でURLクエリパラメータにシリアライズ（詳細は「フィルターユーティリティ」節を参照）

### 4.2 useEntityDetail

詳細画面の全ロジック。

```typescript
function useEntityDetail(config: EntityDetailConfig, id: string) {
  return {
    data: Entity | null;
    loading: boolean;
    error: Error | null;

    // タブ管理
    activeTab: string;
    setActiveTab: (tab: string) => void;

    // 関連データ（タブごとに遅延読み込み）
    relatedData: Record<string, any[]>;
    relatedLoading: Record<string, boolean>;
    relatedCounts: Record<string, number>;  // タブラベルの件数表示用

    // 警告（WarningRuleの評価結果）
    warnings: { message: string; severity: string }[];

    // アクション
    deleteEntity: () => Promise<void>;
    refresh: () => void;
  };
}
```

### 4.3 useEntityForm

フォーム画面の全ロジック。自動計算・連動クリア・子エンティティ管理を内包。

```typescript
function useEntityForm(config: EntityFormConfig, id?: string) {
  return {
    // フォーム状態
    formData: Record<string, any>;
    setField: (key: string, value: any) => void;  // 自動計算・連動クリアが自動発火
    errors: Record<string, string>;

    // 子エンティティ管理（担当者リスト等）
    childEntities: Record<string, any[]>;
    addChildEntity: (key: string, data?: any) => void;
    removeChildEntity: (key: string, index: number) => void;
    updateChildEntity: (key: string, index: number, data: any) => void;

    // エンティティ検索結果のキャッシュ
    entitySearchResults: Record<string, any[]>;
    searchEntity: (configKey: string, query: string) => Promise<void>;
    selectEntity: (configKey: string, entity: any) => void;  // onSelectMapping自動適用

    // 送信
    submit: () => Promise<void>;
    isSubmitting: boolean;

    // モード
    mode: "create" | "edit";
    isLoading: boolean;        // 編集時の初期データ読み込み

    // 楽観的ロック（競合検知）
    conflictError: ConflictError | null;   // 409 Conflict時のエラー情報
    reloadAndRetry: () => Promise<void>;   // 最新データを再取得してフォームに反映
    dismissConflict: () => void;           // 競合エラーを無視して編集を続行（再保存時に再チェック）

    // ユーティリティ
    isDirty: boolean;          // 変更があるか
    reset: () => void;
    getComputedValue: (field: string) => any;  // 自動計算値の取得
  };
}

type ConflictError = {
  message: string;
  currentVersion: number;
  yourVersion: number;
};
```

**内部実装方針:**
- `setField` 呼び出し時に `computedFields` を自動再計算
- `setField` 呼び出し時に `cascadeRules` を自動評価し、該当フィールドをクリア
- `selectEntity` 呼び出し時に `onSelectMapping` に基づいて複数フィールドを一括更新
- `isDirty` で未保存の変更を検知し、ページ離脱時に確認ダイアログ表示
- Zodスキーマによるリアルタイムバリデーション（フィールド離脱時）
- 保存時に `version` をリクエストに含め、409応答時に `conflictError` を設定

### 4.4 useCSVOperations（既存の良い設計を継承・強化）

```typescript
function useCSVOperations(entityType: string) {
  return {
    // インポート
    importCSV: (file: File, options?: ImportOptions) => Promise<void>;
    importProgress: { current: number; total: number; status: string; errors: ImportError[] };
    isImporting: boolean;
    cancelImport: () => void;

    // 重複解決
    duplicates: DuplicateRecord[];
    resolveDuplicate: (id: number, action: "skip" | "overwrite") => void;
    resolveAllDuplicates: (action: "skip" | "overwrite") => void;

    // エクスポート
    exportCSV: (filters?: Record<string, any>) => Promise<void>;
    isExporting: boolean;

    // テンプレート
    downloadTemplate: () => Promise<void>;

    // 結果
    lastResult: ImportResult | null;
    downloadErrorLog: () => Promise<void>;  // エラーログCSVダウンロード
  };
}
```

### 4.5 useTablePreferences（テーブル列設定のDB永続化）

> **実装ファイル**: `src/hooks/use-table-preferences.ts`

```typescript
function useTablePreferences(tableKey: string): {
  preferences: PersistedColumnSettings | null;
  isLoading: boolean;
  savePreferences: (settings: PersistedColumnSettings) => void;  // デバウンス付き自動保存
}

type PersistedColumnSettings = {
  columnOrder: string[];
  columnVisibility: Record<string, boolean>;
  columnWidths: Record<string, number>;
  sortState: { field: string; direction: 'asc' | 'desc' }[];
  /** 左固定列の列IDリスト（Excel風の列固定） */
  columnPinning?: { left: string[] };
};
```

**内部実装方針:**
- `GET /api/v1/user-preferences/table?tableKey={key}` で設定読込（React Query）
- `PUT /api/v1/user-preferences/table` でupsert保存
- `user_table_preferences` テーブルに `@@unique([userId, tableKey])` で保存
- 設定変更時に1秒デバウンス付き自動保存（`useRef` タイマー）
- `SpreadsheetTable` が変更を検知するたびに呼び出す

### 4.6 useTableViews（テーブルビューの保存・切替）

> **実装ファイル**: `src/hooks/use-table-views.ts`
> **実装時期**: Phase 1.5（絞り込み機能の後）

テーブルの表示状態（表示列・ソート・絞り込み・ページサイズ）を名前付きで複数保存し、切り替えて使うためのフック。
全一覧画面（顧客・代理店等）で共通利用する。

```typescript
type TableViewConfig = {
  columnOrder: string[];
  columnVisibility: Record<string, boolean>;
  columnWidths: Record<string, number>;
  sortState: { field: string; direction: 'asc' | 'desc' }[];
  columnPinning?: { left: string[] };  // 左固定列
  filters: Record<string, string>;   // フィルター値（key: value）
  pageSize: number;
};

type TableView = {
  id: number;
  viewName: string;
  isDefault: boolean;
  config: TableViewConfig;
  displayOrder: number;
};

function useTableViews(tableKey: string): {
  views: TableView[];                              // 保存済みビュー一覧
  activeView: TableView | null;                    // 現在適用中のビュー
  isLoading: boolean;
  applyView: (viewId: number) => void;             // ビュー適用
  saveView: (name: string, config: TableViewConfig) => Promise<void>;  // 新規保存
  updateView: (viewId: number, config: TableViewConfig) => Promise<void>;  // 上書き保存
  deleteView: (viewId: number) => Promise<void>;   // 削除
  setDefault: (viewId: number) => Promise<void>;   // デフォルト設定
};
```

**内部実装方針:**
- `GET /api/v1/user-preferences/table-views?tableKey={key}` で一覧取得（React Query）
- `POST /api/v1/user-preferences/table-views` で新規作成
- `PATCH /api/v1/user-preferences/table-views/:id` で更新
- `DELETE /api/v1/user-preferences/table-views/:id` で削除
- `user_table_views` テーブルに `@@unique([userId, tableKey, viewName])` で保存
- ビュー適用時にフック内部で `applyView` → 列設定・ソート・フィルターを一括復元
- 既存の `useTablePreferences` とは併存（既存は「現在の状態」の自動保存、ビューは「名前付き保存」）

**UIコンポーネント:**
- `ViewBar` — テーブル上部にビュー切替タブ + 保存ボタンを表示
- 現在の表示条件に変更がある場合は「保存」ボタンをハイライト

```
┌──────────────────────────────────────────────────────────────┐
│ ビュー: [デフォルト] [営業用] [経理用]  [▼ 保存...] [+ 新規]    │
├──────────────────────────────────────────────────────────────┤
│ テーブル                                                      │
└──────────────────────────────────────────────────────────────┘
```

**依存関係:**
- FilterPanel の実装が前提（絞り込み条件をビューに含めるため）
- `useTablePreferences` と連携（ビュー適用時に `savePreferences` を呼び出して列設定を反映）

### 4.7 useInlineCellEdit（インライン編集→PATCH→楽観的更新）

> **実装ファイル**: `src/hooks/use-inline-cell-edit.ts`

```typescript
function useInlineCellEdit(config: EntityListConfig): {
  updateCell: (rowId: number, fieldKey: string, value: unknown, currentVersion: number) => Promise<void>;
}
```

**内部動作:**
1. `PATCH {config.patchEndpoint(rowId)}` を `{ [fieldKey]: value, version: currentVersion }` で送信
2. 成功時: React Query キャッシュのリスト内の該当行をサーバーレスポンスで置換（新 `version` 取得）
3. 409 Conflict: トースト通知（「競合が発生しました。データを再取得します」）+ `queryKey` を invalidate してリスト再取得
4. その他エラー: 楽観的更新をロールバック（EditableCell 側が `originalValueRef` で元の値に戻す）

---

## 5. UIコンポーネント一覧

### 5.1 レイアウト

| コンポーネント | 用途 | 主要Props |
|---|---|---|
| `AppLayout` | アプリ全体（サイドバー+ヘッダー+メイン） | children, currentBusiness |
| `PageHeader` | ページヘッダー（タイトル+アクション+パンくず） | title, actions[], breadcrumbs[] |
| `TabLayout` | タブ切り替え | tabs[], activeTab, onChange, counts? |
| `FormLayout` | フォームセクション分割 | sections[], columns |
| `WarningBanner` | データ整合性警告の黄色バナー | warnings[], severity |

### 5.2 データ表示

| コンポーネント | 用途 | 主要Props |
|---|---|---|
| `DataTable` | インライン編集対応テーブル（後述） | columns, data, editConfig, density |
| `ViewBar` | テーブルビュー切替バー（後述） | views[], activeViewId, onApply, onSave, onDelete |
| `TableSettingsModal` | テーブル表示設定モーダル（3タブ） | settings, onSave, onReset |
| `StatisticsCard` | 統計数値カード（スケルトン対応） | label, value, trend?, loading? |
| `StatisticsCardGroup` | 統計カードグループ | cards[], loading |
| `AnalyticsPanel` | 統計カード + グラフの切り替えパネル | statistics, charts, period |
| `Chart` | 汎用グラフ（bar/pie/line切り替え） | type, data, config |
| `StatusBadge` | ステータスバッジ | status, colorMap |
| `ProgressBar` | 進捗バー | current, total, label? |
| `EmptyState` | データなし表示 | message, action? |
| `ImagePreview` | 画像サムネイル+プレビュー+ダウンロード | src, alt, previewable, downloadable |
| `SkeletonLoader` | スケルトンローディング | type: "card"\|"table"\|"form" |

### 5.3 DataTable / SpreadsheetTable

#### DataTable（通常テーブル）

`EntityListConfig.inlineEditable` が `false`（デフォルト）の場合に使用。行クリックで詳細画面に遷移する読み取り専用テーブル。

```typescript
type DataTableProps = {
  columns: ColumnDef[];
  data: Record<string, unknown>[];
  onRowClick?: (row: Record<string, unknown>) => void;
  sortItems?: { field: string; direction: 'asc' | 'desc' }[];
  onSort?: (field: string) => void;
  loading?: boolean;
};
```

#### SpreadsheetTable（スプレッドシートテーブル）

> **実装ファイル**: `src/components/ui/spreadsheet-table.tsx`

`EntityListConfig.inlineEditable: true` の場合に `EntityListTemplate` から使用される。
全フィールドを列として表示し、セル単位インライン編集に対応。

```typescript
type SpreadsheetTableProps = {
  columns: ColumnDef[];
  data: Record<string, unknown>[];
  config: EntityListConfig;
  sortItems: { field: string; direction: 'asc' | 'desc' }[];
  onSort: (field: string) => void;
  loading?: boolean;
  preferences: PersistedColumnSettings | null;      // useTablePreferences から
  savePreferences: (s: PersistedColumnSettings) => void;
  updateCell: ReturnType<typeof useInlineCellEdit>['updateCell'];
  queryKey: unknown[];
};
```

**機能一覧:**
- `@tanstack/react-table` v8 でヘッダー・列幅・可視性・順序を管理
- `@dnd-kit/core` + `@dnd-kit/sortable` で列ドラッグ&ドロップ並び替え
- 列端のドラッグで幅リサイズ（mousedown/mousemove/mouseup）
- ヘッダー右側の `ColumnSettingsPanel` ボタンで列表示切替
- 各セルは `EditableCell` でラップ（`edit` プロパティなしは読み取り専用）
- 最右端に「詳細を開く」アイコン列（`detailPath` で遷移）
- 列固定（ピン留め）: ヘッダーのピンアイコンで左固定。ローカル `useState` で即時反映 + DB保存はバックグラウンド
- `border-collapse: separate` + CSS `position: sticky` + `left` 計算でExcel風フリーズペイン
- 列設定（order/visibility/width/pinning）変更時に `savePreferences` を呼び出してDB保存

#### EditableCell（編集可能セル）

> **実装ファイル**: `src/components/ui/editable-cell.tsx`

| 状態 | トリガー | 表示 |
|------|---------|------|
| `display` | 初期 / 保存完了 / キャンセル後 | 通常テキスト表示（ホバーで青背景） |
| `editing` | クリック | `CellEditor` コンポーネントを表示 |
| `saving` | blur/Enter 後 | 薄いオーバーレイ + スピナー |
| `error` | バリデーション失敗 / API エラー | 赤枠 + エラーメッセージ |

**特殊動作:**
- `checkbox` 型: クリックで即トグル（`editing` 状態なし）
- 外部からの `value` 更新（楽観的更新）は `display` 状態のときのみ反映
- `useRef` + `handleCommitRef` パターンで `handleClick` と `handleCommit` の循環依存を回避

#### CellEditor（セルエディタ）

> **実装ファイル**: `src/components/ui/cell-editor.tsx`

`CellEditConfig.type` に応じた入力UIをレンダリング。コンパクトなボーダーレススタイル（テーブル内専用）。

| type | レンダリング |
|------|------------|
| `text` / `email` / `phone` / `url` | `<input>` |
| `number` | `<input type="number">` |
| `select` | `<select>` |
| `master-select` | `<select>`（APIからマスタ選択肢を動的取得） |
| `date` | `<input type="date">` |
| `month` | `<input type="month">` |
| `textarea` | `<textarea>` |
| `checkbox` | `<input type="checkbox">` |

#### ColumnSettingsPanel（列設定パネル）

> **実装ファイル**: `src/components/ui/column-settings-panel.tsx`

`DropdownMenu` で列の表示/非表示をトグル。`locked: true` の列は変更不可。
各列にピンアイコンで左固定のON/OFFを切替可能（`pinnedCols` / `onTogglePin` props経由）。
「デフォルトに戻す」ボタンで初期表示（固定含む）に戻す。

#### ViewBar（テーブルビュー切替バー）

> **実装ファイル**: `src/components/ui/view-bar.tsx`
> **実装時期**: Phase 1.5（FilterBar 実装後）

テーブル上部に表示されるビュー切替UI。保存済みのビューをタブ形式で切り替え、新規作成・上書き保存・削除ができる。
共通コンポーネントとして全一覧画面で利用する。

```typescript
type ViewBarProps = {
  views: TableView[];
  activeViewId: number | null;
  hasUnsavedChanges: boolean;   // 現在の状態がビューから変更されたか
  onApply: (viewId: number) => void;
  onSaveNew: (name: string) => void;
  onUpdate: (viewId: number) => void;
  onDelete: (viewId: number) => void;
  onSetDefault: (viewId: number) => void;
};
```

**レイアウト:**
```
┌──────────────────────────────────────────────────────────────────┐
│ [デフォルト] [営業用] [経理用]  │  [上書き保存] [名前を付けて保存]  │
└──────────────────────────────────────────────────────────────────┘
```

**機能:**
- ビュータブクリック → `onApply` で列・ソート・フィルターを一括復元
- 現在の状態がビューと異なる場合は「上書き保存」ボタンをアクティブ化
- 「名前を付けて保存」→ ダイアログでビュー名入力 → `onSaveNew`
- ビュータブ右クリック or 長押し → コンテキストメニュー（名前変更・デフォルト設定・削除）
- デフォルトビューはページ読み込み時に自動適用

### 5.4 入力

| コンポーネント | 用途 | 主要Props |
|---|---|---|
| `FormField` | 統一フォームフィールド | fieldDef, value, onChange, error |
| `SearchInput` | デバウンス付き検索 | value, onChange, placeholder, debounceMs |
| `FilterPanel` | 絞り込みパネル（Popover方式） | filters, activeFilters, onFilterChange, onClearAll |
| `QuickFilter` | チェックボックス式クイックフィルター（**未実装**: Phase 2+） | options[], selected, onChange |
| `EntitySearch` | エンティティ検索（インクリメンタルサーチ） | config, value, onChange, onSelect |
| `DatePicker` | 日付選択 | value, onChange, format? |
| `MonthPicker` | 月選択 | value, onChange |
| `PeriodSelector` | 期間選択（全期間/単月/範囲） | value, onChange, mode |
| `CurrencyInput` | 金額入力（カンマ区切り + 単位表示） | value, onChange, suffix? |
| `NumberInput` | 数値入力（min/max/step + 単位表示） | value, onChange, config |
| `PostalCodeField` | 郵便番号→住所自動入力 | value, onChange, onAddressFill |
| `FileUploader` | ファイルアップロード | accept, maxSize, onUpload, preview |
| `ChildEntityList` | 子エンティティ追加/削除リスト | items, fields, onAdd, onRemove, onUpdate |

#### フィルターサブコンポーネント

> **実装ディレクトリ**: `src/components/ui/filters/`

`FilterPanel` 内部で `FilterDef.type` に応じてレンダリングされるサブコンポーネント群。

| コンポーネント | 対応する FilterDef.type | 概要 |
|---|---|---|
| `FilterSelect` | `select` | 単一選択ドロップダウン |
| `FilterMultiSelect` | `multi-select` | 複数選択（チェックボックスリスト + バッジ表示） |
| `FilterText` | `text` | テキスト入力（デバウンス対応） |
| `FilterDateRange` | `date-range` | 開始日〜終了日の範囲選択 |
| `FilterNumberRange` | `number-range` | 最小値〜最大値の範囲入力（単位表示対応） |
| `FilterBoolean` | `boolean` | 真偽値の切替（カスタムラベル対応） |
| `FilterCheckboxGroup` | `checkbox-group` | チェックボックスグループ |

各サブコンポーネントは共通のインターフェースに従い、`value: string` / `onChange: (value: string) => void` で値を受け渡す。複合値（multi-select, date-range, number-range）はフィルターユーティリティ（`filter-utils.ts`）でシリアライズ/デシリアライズする。

### 5.5 フィードバック

| コンポーネント | 用途 | 主要Props |
|---|---|---|
| `Modal` | 汎用モーダル | isOpen, onClose, title, size, children |
| `ConfirmModal` | 確認ダイアログ | message, onConfirm, onCancel, variant |
| `Toast` | トースト通知 | message, type, duration |
| `LoadingSpinner` | ローディング | size?, message? |
| `ErrorDisplay` | エラー表示 | error, onRetry? |
| `CSVProgressModal` | CSVインポート進捗 | progress, onCancel |
| `CSVErrorDisplay` | CSVエラー詳細 + ログDL | errors, onDownloadLog |
| `CSVResultModal` | CSV完了サマリー | result |
| `DuplicateResolutionModal` | CSV重複データ解決 | duplicates, onResolve |
| `UnsavedChangesDialog` | 未保存変更の離脱確認 | isDirty, onLeave, onStay |
| `ConflictDialog` | 楽観的ロック競合時の解決UI | conflict, onReload, onDismiss |
| `BatchActionBar` | 一括操作バー（選択件数 + アクションボタン） | selectedCount, actions, onExecute |
| `BatchConfirmModal` | 一括操作確認ダイアログ | action, count, onConfirm, onCancel |
| `InactiveRecordBanner` | 無効レコードの警告バナー | entityType, onRestore |

### 5.6 ナビゲーション

| コンポーネント | 用途 | 主要Props |
|---|---|---|
| `Sidebar` | サイドバーナビゲーション（折りたたみ対応） | なし（内部で useAuth / usePathname / localStorage を利用） |
| `Breadcrumbs` | パンくずリスト | items[] |
| `Pagination` | ページネーション | config, onChange |
| `BusinessSwitcher` | 事業切り替え | businesses, currentId, onChange |

### 5.7 ビジネス固有

| コンポーネント | 用途 | 主要Props |
|---|---|---|
| `MovementTimeline` | ムーブメント進捗タイムライン | steps, movements, onStatusChange |
| `MovementDetailModal` | ムーブメント詳細/ステータス変更 | movement, template, onUpdate |
| `GanttChart` | ガントチャート | projects, templates, dateRange, filters |
| `PipelineChart` | パイプラインチャート | stages, data |
| `SalesStatusSelector` | 営業ステータス選択（優先度制御付き） | statuses, currentValue, onChange |
| `StatusChangeModal` | ステータス変更モーダル（連動スキップ表示） | project, statuses, movements, onConfirm |
| `BusinessCustomDataPanel` | 事業別カスタム情報の表示・編集 | entityId, entityType, businessLinks |
| `BusinessContactFilter` | 担当者一覧の事業フィルタータブ | contacts, businesses, selectedBusinessId |

#### BusinessCustomDataPanel

顧客詳細画面の「事業別情報」タブで使用。`customer_business_links`のデータを事業ごとにタブ切り替えで表示・編集する。

```
┌─────────────────────────────────────────────────┐
│ 事業別情報                                        │
│                                                   │
│ [MOAG事業] [サービスA事業] [+事業を追加]            │
│ ─────────────────────────────────────             │
│                                                   │
│  設備規模: [大規模 ▼]                              │
│  工場数:   [3        ]                             │
│                                                   │
│  ※ フィールドはbusiness_config.customerFieldsから   │
│    動的生成                                        │
│                                                   │
│                          [保存]                    │
└─────────────────────────────────────────────────┘
```

**動作仕様:**
- 事業タブ: `customer_business_links`のレコードごとにタブ表示
- 「+事業を追加」: まだリンクがない事業を選択してリンク作成
- フィールド: `business_config.customerFields`のJSON Schema定義から動的レンダリング
- 保存: `link_custom_data`を更新

#### BusinessContactFilter

担当者タブで事業フィルタリングを行うタブUI。

```
┌─────────────────────────────────────────────────┐
│ 担当者                                            │
│                                                   │
│ [全て(5)] [MOAG事業(2)] [サービスA(1)] [共通(2)]    │
│ ─────────────────────────────────────             │
│                                                   │
│  田中太郎  設備部 部長  03-xxxx-xxxx  MOAG事業     │
│  山田花子  設備部 課長  03-xxxx-xxxx  MOAG事業     │
│  佐藤一郎  経理部 部長  03-xxxx-xxxx  サービスA    │
│  鈴木次郎  総務部 課長  03-xxxx-xxxx  全事業共通   │
│  高橋三郎  代表取締役   03-xxxx-xxxx  全事業共通   │
│                                                   │
│                          [担当者を追加]            │
└─────────────────────────────────────────────────┘
```

**動作仕様:**
- フィルタータブ: 全て / 事業名ごと / 共通（business_id=NULL）
- 件数バッジ: 各タブにフィルター後の件数を表示
- 担当者追加時: 事業を選択可能（NULLで全事業共通）

### 5.8 予実管理

| コンポーネント | 用途 | 主要Props |
|---|---|---|
| `BudgetTargetTable` | 月別売上目標の入力テーブル | businessId, year, targets, onSave |
| `BudgetActualChart` | 予実対比グラフ（棒グラフ+折れ線） | targets, actuals, period |
| `BudgetProgressBar` | 目標達成率プログレスバー | target, actual, label |
| `BudgetSummaryCard` | 予実サマリーカード（目標/実績/達成率） | target, actual, period |
| `PartnerBudgetTable` | 代理店別目標入力テーブル | businessId, year, month, partners |

**予実ダッシュボードの構成:**

```typescript
// 予実管理はダッシュボードの一部として表示
type BudgetDashboardConfig = {
  // 期間選択
  periodSelector: {
    type: "month" | "quarter" | "year";
    defaultPeriod: "current_month";
  };
  // サマリーカード
  summaryCards: [
    { label: "売上目標", field: "targetAmount", format: "currency" },
    { label: "売上実績", field: "actualAmount", format: "currency" },
    { label: "達成率", field: "achievementRate", format: "percent" },
    { label: "残り", field: "remainingAmount", format: "currency" },
  ];
  // グラフ
  charts: [
    { type: "bar_line", title: "月別予実推移",
      bars: "actualAmount", line: "targetAmount", xAxis: "month" },
    { type: "bar", title: "代理店別実績",
      dataEndpoint: "/api/v1/budgets/by-partner", xField: "partnerName", yField: "actualAmount" },
  ];
};
```

### 5.9 通知

| コンポーネント | 用途 | 主要Props |
|---|---|---|
| `NotificationBell` | ヘッダーの通知ベルアイコン（未読バッジ付き） | unreadCount, onClick |
| `NotificationDrawer` | 通知一覧ドロワー（右サイドから展開） | notifications, onMarkRead, onClose |
| `NotificationItem` | 通知1件の表示 | notification, onClick |
| `NotificationSettingsForm` | 通知設定フォーム（将来拡張用） | settings, onSave |

**通知ドロワーの仕様:**

```
┌────────────────────────────────┐
│ 通知 (3件の未読)        [全て既読] │
├────────────────────────────────┤
│ ● 案件MG-001のステータスが変更     │ ← 未読（太字）
│   Bヨミ → Aヨミ(申請中)          │
│   2分前                         │
├────────────────────────────────┤
│ ● 受注予定日を超過しています       │ ← 未読
│   案件MG-015 (2026年1月予定)     │
│   1時間前                       │
├────────────────────────────────┤
│ ○ CSVインポートが完了しました      │ ← 既読（薄字）
│   50件中48件成功、2件エラー       │
│   昨日                          │
└────────────────────────────────┘
```

**通知フック:**

```typescript
function useNotifications() {
  return {
    notifications: Notification[];
    unreadCount: number;
    markAsRead: (id: number) => Promise<void>;
    markAllAsRead: () => Promise<void>;
    isLoading: boolean;
    // ポーリング（30秒間隔）またはSSE
    refetch: () => void;
  };
}
```

### 5.10 データ品質

| コンポーネント | 用途 | 主要Props |
|---|---|---|
| `DuplicateCheckBanner` | 重複候補の警告バナー（フォーム上部） | duplicates, entityType |
| `DuplicateListModal` | 重複候補一覧モーダル | candidates, onSelect, onIgnore |

**重複チェックの動作仕様:**

```typescript
// フォーム入力時のリアルタイム重複チェック
type DuplicateCheckConfig = {
  // チェック対象フィールド
  checkFields: string[];           // ["customerName", "customerPhone"]
  // チェックAPI
  checkEndpoint: string;           // "/api/v1/customers/duplicate-check"
  // デバウンス（入力完了後にチェック実行）
  debounceMs: number;              // 500
  // 類似度閾値（0-1）
  similarityThreshold: number;     // 0.8
};

// EntityFormConfigに追加
type EntityFormConfig = {
  // ... 既存フィールド
  duplicateCheck?: DuplicateCheckConfig;
};
```

**フォーム上の表示:**
```
┌──────────────────────────────────────────┐
│ ⚠ 類似する顧客が見つかりました              │
│                                          │
│ 「株式会社ABC」→ 既存: 「株式会社ABC商事」   │
│ [既存データを表示] [無視して続行]             │
└──────────────────────────────────────────┘
```

### 5.11 代理店ポータル

代理店ユーザーは専用のポータル画面でアクセスする。閲覧のみ（編集不可）。

| コンポーネント | 用途 | 主要Props |
|---|---|---|
| `PartnerPortalLayout` | 代理店専用レイアウト | partner, businesses |
| `PartnerSummaryDashboard` | 代理店の売上実績サマリー | partnerId, period |
| `PartnerProjectList` | 代理店に紐づく案件一覧（閲覧のみ） | partnerId, businessId |

**代理店ポータルの画面構成:**

```
┌──────────────────────────────────────────────────────────┐
│ [ロゴ] 代理店ポータル - ○○代理店          [通知🔔] [ログアウト] │
├──────────────────────────────────────────────────────────┤
│ 事業切り替え: [MOAG事業] [サービスA事業]                      │
├──────────────────────────────────────────────────────────┤
│ 売上実績サマリー                                            │
│ ┌──────────┐┌──────────┐┌──────────┐                    │
│ │ 今月実績   ││ 今月目標   ││ 達成率    │                    │
│ │ 2,500万   ││ 3,000万   ││ 83.3%    │                    │
│ └──────────┘└──────────┘└──────────┘                    │
│                                                          │
│ [月別推移グラフ（棒グラフ）]                                  │
├──────────────────────────────────────────────────────────┤
│ 案件一覧                                [CSVエクスポート]    │
│ ┌──────┬────────┬──────────┬────────┬────────┐          │
│ │案件No │ 顧客名  │ ステータス │ 金額    │ 受注予定 │          │
│ ├──────┼────────┼──────────┼────────┼────────┤          │
│ │MG-01 │ A社    │ Bヨミ    │ 500万  │ 2026/03│          │
│ │MG-02 │ B社    │ 購入済   │ 1,200万│ 2026/01│          │
│ └──────┴────────┴──────────┴────────┴────────┘          │
│ ※テーブルは閲覧のみ（インライン編集・リンク遷移なし）             │
├──────────────────────────────────────────────────────────┤
│ Pagination                                               │
└──────────────────────────────────────────────────────────┘
```

---

## 6. テンプレート画面

### 6.1 EntityListTemplate

```
┌──────────────────────────────────────────────────────────┐
│ PageHeader: タイトル + [⚙設定] [CSVインポート] [+新規作成]  │
├──────────────────────────────────────────────────────────┤
│ AnalyticsPanel（権限で表示/非表示）                         │
│ ┌──────────────┬──────────────┐                          │
│ │ [統計カード]  │ [グラフ分析]  │  ← タブ切り替え            │
│ ├──────────────┴──────────────┤                          │
│ │ ┌──────┐┌──────┐┌──────┐┌──────┐  ← 統計カード群       │
│ │ │全案件 ││見込み ││購入済 ││総売上 │  （スケルトン対応）     │
│ │ │ 128  ││ 85   ││ 43   ││5.2億 │                      │
│ │ └──────┘└──────┘└──────┘└──────┘                      │
│ │ [PeriodSelector: 全期間 | 2026年1月 | 範囲指定]          │
│ └─────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────┤
│ SearchInput                                              │
├──────────────────────────────────────────────────────────┤
│ BatchActionBar（チェック選択時のみ表示）                       │
│ ┌──────────────────────────────────────────────────┐    │
│ │ ✓ 3件選択中  [ステータス一括変更] [担当者一括変更] [一括削除] │    │
│ │              [選択解除]                            │    │
│ └──────────────────────────────────────────────────┘    │
├──────────────────────────────────────────────────────────┤
│ DataTable（インライン編集 + チェックボックス選択対応）           │
│  ┌──┬──────┬───────┬───────────┬────────┬──────┐       │
│  │☐ │案件No │ 顧客名 │ ステータス  │ 金額    │ 備考  │       │
│  ├──┼──────┼───────┼───────────┼────────┼──────┤       │
│  │☑ │MG-01 │ A社   │ [Bヨミ ▼]  │ 500万  │ ...  │←セル編集│
│  │☑ │MG-02 │ B社   │ [アポ中 ▼] │ 1,200万│ ...  │       │
│  │☐ │MG-03 │ C社   │ [Aヨミ ▼]  │ 800万  │ ...  │       │
│  └──┴──────┴───────┴───────────┴────────┴──────┘       │
│  ※ダブルクリックで編集、Tab移動、Enter保存                    │
├──────────────────────────────────────────────────────────┤
│ Pagination: < 1 2 3 ... 10 >  25件/ページ                │
└──────────────────────────────────────────────────────────┘

[⚙設定] → TableSettingsModal
┌─────────────────────────────────────────┐
│ テーブル表示設定                          │
│ ┌────────┬──────────┬──────────┐        │
│ │基本設定 │列の表示    │ソート設定  │        │
│ └──┬─────┴──────────┴──────────┘        │
│    │ 表示件数: [10] [25] [50] [100]     │
│    │ 行の高さ: [コンパクト] [標準] [ゆったり]│
│    │                                    │
│    │ (列タブ: ドラッグ&ドロップ並び替え)    │
│    │ (ソートタブ: 複数列ソート設定)         │
│    │                                    │
│    │ [リセット]              [閉じる]      │
│    │ ※設定は自動保存されます                │
└─────────────────────────────────────────┘
```

**SpreadsheetTable モード (`inlineEditable: true`):**

```
┌──────────────────────────────────────────────────────────────┐
│ PageHeader: 顧客一覧 + [+新規作成]                              │
├──────────────────────────────────────────────────────────────┤
│ SearchInput                                                    │
├──────────────────────────────────────────────────────────────┤
│ ツールバー:                          [絞り込み(N)] [列設定]       │
├────┬────────┬────────┬────────┬───────┬───────┬──────────────┤
│    │顧客コード│ 顧客名  │ 呼称   │ 種別  │業種   │ ・・・ │↗│ ←列設定
├────┼────────┼────────┼────────┼───────┼───────┼──────────────┤
│    │CST-0001│[A社  ▏]│[テクノ▏]│[法人▼]│[製造▏]│       │↗│
│    │CST-0002│[B社  ▏]│        │[法人▼]│[IT  ▏]│       │↗│
└────┴────────┴────────┴────────┴───────┴───────┴──────────────┘
 ↑ 読み取り専用  ↑ 編集可能セル（クリックで編集モード）     ↑ 詳細へ
│ Pagination                                                    │
└──────────────────────────────────────────────────────────────┘
```

- セルクリック → 編集モード、blur/Enter → 即時保存（PATCH）
- 列ヘッダーをドラッグで順序変更、端をドラッグで幅調整
- ツールバーの「絞り込み(N)」ボタンで `FilterPanel`（Popover方式）を表示
- ツールバーの「列設定」ボタンでドロップダウンパネルから表示/非表示を切替
- 設定はDBに自動保存（ユーザー単位）

### 6.2 EntityDetailTemplate

```
┌──────────────────────────────────────────────────────────┐
│ PageHeader: 顧客名 + [編集] [営業ステータス変更] [削除]      │
├──────────────────────────────────────────────────────────┤
│ WarningBanner（条件に該当する場合のみ表示）                   │
│ ⚠ 受注予定日（2026-01-31）を超過しています                  │
├──────────────────────────────────────────────────────────┤
│ TabLayout                                                │
│ ┌──────┬──────────┬───────────┬──────┬────────┐         │
│ │基本情報│担当者(3)  │ 関連案件(12)│ﾑｰﾌﾞﾒﾝﾄ│ ファイル│         │
│ └──┬───┴──────────┴───────────┴──────┴────────┘         │
│    ▼                                                     │
│ [基本情報タブ]                                              │
│ ┌─────────────────────────────────────────┐             │
│ │ セクション: 会社情報（2列レイアウト）         │             │
│ │ ┌─────────────┬─────────────┐           │             │
│ │ │ 顧客コード   │ 顧客名       │           │             │
│ │ │ C001        │ 株式会社A     │           │             │
│ │ ├─────────────┼─────────────┤           │             │
│ │ │ 代表者名     │ 代表者名刺    │           │             │
│ │ │ 山田太郎     │ [📷サムネイル] │← クリック  │             │
│ │ │             │ [DL] [プレビュー]│ でプレビュー│            │
│ │ ├─────────────┴─────────────┤           │             │
│ │ │ 住所（全幅）                │           │             │
│ │ │ 東京都渋谷区...            │           │             │
│ │ └───────────────────────────┘           │             │
│ │                                         │             │
│ │ セクション: 企業情報                       │             │
│ │ ┌─────────────┬─────────────┐           │             │
│ │ │ 従業員数     │ 資本金       │           │             │
│ │ │ 150名       │ 5,000万円    │           │             │
│ │ └─────────────┴─────────────┘           │             │
│ └─────────────────────────────────────────┘             │
│                                                          │
│ [担当者タブ]                                               │
│ ┌─────────────────────────────────────────┐             │
│ │ 担当者一覧テーブル                         │             │
│ │ + 名刺画像インラインプレビュー               │             │
│ └─────────────────────────────────────────┘             │
│                                                          │
│ [関連案件タブ]                                             │
│ ┌─────────────────────────────────────────┐             │
│ │ 同一顧客の案件一覧（クリックで遷移）          │             │
│ │ MG-001 | Bヨミ  | 500万 → 詳細へ         │             │
│ │ MG-002 | 購入済 | 1,200万 → 詳細へ       │             │
│ └─────────────────────────────────────────┘             │
│                                                          │
│ [ムーブメントタブ]                                          │
│ ┌─────────────────────────────────────────┐             │
│ │ MovementTimeline（ステップ進捗表示）        │             │
│ │ ①営業ステータス ✅ → ②設置場所共有 🔄 → ...│             │
│ │ [ステータス変更] ボタンでモーダル表示         │             │
│ └─────────────────────────────────────────┘             │
└──────────────────────────────────────────────────────────┘
```

### 6.3 EntityFormTemplate

```
┌──────────────────────────────────────────────────────────┐
│ PageHeader: 案件 新規作成                                  │
├──────────────────────────────────────────────────────────┤
│ FormLayout                                               │
│ ┌─────────────────────────────────────────┐             │
│ │ セクション: 基本情報 (2列)                 │             │
│ │ ┌─────────────┬─────────────┐           │             │
│ │ │ 案件番号      │              │           │             │
│ │ │ [MG-C001-003]│              │           │             │
│ │ │ (自動生成/RO) │              │           │             │
│ │ ├─────────────┼─────────────┤           │             │
│ │ │ 顧客*        │ 代理店       │           │             │
│ │ │ [🔍A社を検索] │ [🔍検索]     │← ｲﾝｸﾘﾒﾝﾀﾙ │             │
│ │ │ ↓選択時↓      │              │ ｻｰﾁ      │             │
│ │ │ →住所・電話等  │              │           │             │
│ │ │  を自動入力   │              │           │             │
│ │ ├─────────────┼─────────────┤           │             │
│ │ │ 営業ステータス*│ 担当者       │           │             │
│ │ │ [▼ アポ中]    │ [▼ 選択]     │           │             │
│ │ └─────────────┴─────────────┘           │             │
│ │                                         │             │
│ │ セクション: 台数・金額情報 (2列)            │             │
│ │ ┌─────────────┬─────────────┐           │             │
│ │ │ 一般機 台数   │ 一般機 単価   │           │             │
│ │ │ [3] 台       │ [150] 万円   │           │             │
│ │ ├─────────────┤             │           │             │
│ │ │ 一般機 金額   │              │           │             │
│ │ │ 450万円 (自動) │              │← 自動計算  │             │
│ │ ├─────────────┼─────────────┤           │             │
│ │ │ 合計台数      │ 合計金額     │           │             │
│ │ │ 5台 (自動)   │ 850万円 (自動)│← 自動計算  │             │
│ │ └─────────────┴─────────────┘           │             │
│ │                                         │             │
│ │ セクション: EXTケア情報 (2列)              │             │
│ │ ┌─────────────┬─────────────┐           │             │
│ │ │ EXTケア加入   │ 契約期間     │           │             │
│ │ │ [▼ ×]        │ (非表示)     │← ○選択で  │             │
│ │ │ ↓「×」に変更↓  │              │ 表示される │             │
│ │ │ →契約期間を    │              │           │             │
│ │ │  自動クリア    │              │           │             │
│ │ └─────────────┴─────────────┘           │             │
│ │                                         │             │
│ │ セクション: 担当者（子エンティティ管理）      │             │
│ │ ┌───────────────────────────────┐       │             │
│ │ │ [既存担当者から選択 ▼] or [新規] │       │             │
│ │ │ 1. 山田太郎 - 営業部 [×削除]    │       │             │
│ │ │ 2. 鈴木花子 - 総務部 [×削除]    │       │             │
│ │ │ [+ 担当者を追加]               │       │             │
│ │ └───────────────────────────────┘       │             │
│ └─────────────────────────────────────────┘             │
│                                                          │
│ [キャンセル]                              [保存]           │
│                                                          │
│ ※未保存の変更がある状態でページ離脱→確認ダイアログ表示         │
│                                                          │
│ ── 楽観的ロック競合時 ──────────────────────────            │
│ ┌──────────────────────────────────────────────┐        │
│ │ ⚠ このレコードは他のユーザーにより更新されました   │        │
│ │                                              │        │
│ │ 最新データを再読み込みすると、あなたの編集内容は   │        │
│ │ 失われます。                                   │        │
│ │                                              │        │
│ │ [最新データを読み込む]  [編集を続ける]             │        │
│ └──────────────────────────────────────────────┘        │
└──────────────────────────────────────────────────────────┘
```

---

## 7. API層の統一設計

### 7.1 APIクライアント

```typescript
// lib/apiClient.ts
class ApiClient {
  // 統一レスポンス変換（snake_case → camelCase自動変換）
  private transformResponse<T>(response: ApiResponse<T>): T;

  // 統一エラーハンドリング
  private handleError(error: ApiError): never;

  // CRUD操作
  async getList<T>(endpoint: string, params?: ListParams): Promise<ListResponse<T>>;
  async getById<T>(endpoint: string, id: string): Promise<T>;
  async create<T>(endpoint: string, data: Partial<T>): Promise<T>;
  async update<T>(endpoint: string, id: string, data: Partial<T>): Promise<T>;
  async delete(endpoint: string, id: string): Promise<void>;
}
```

### 7.2 統一レスポンス形式

```typescript
// 一覧取得
type ListResponse<T> = {
  success: true;
  data: T[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
};

// 単体取得・作成・更新
type SingleResponse<T> = {
  success: true;
  data: T;
};

// エラー
type ErrorResponse = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: ValidationError[];
  };
};
```

---

## 8. ディレクトリ構成

```
src/
├── app/                              # Next.js App Router
│   ├── (auth)/                       # 認証が必要なページ群
│   │   ├── layout.tsx                # 認証チェック + AppLayout
│   │   ├── dashboard/                # ダッシュボード
│   │   ├── customers/                # 顧客管理
│   │   │   ├── page.tsx              # 一覧 → EntityListTemplate + customerListConfig
│   │   │   ├── [id]/page.tsx         # 詳細 → EntityDetailTemplate + customerDetailConfig
│   │   │   ├── new/page.tsx          # 新規 → EntityFormTemplate + customerFormConfig
│   │   │   └── [id]/edit/page.tsx    # 編集 → EntityFormTemplate + customerFormConfig
│   │   ├── partners/                 # 代理店管理（同構造）
│   │   ├── projects/                 # 案件管理（同構造）
│   │   ├── budgets/                  # 予実管理
│   │   │   └── page.tsx              # 目標設定 + 予実ダッシュボード
│   │   └── settings/                 # 設定
│   ├── (partner)/                    # 代理店専用ページ群
│   │   ├── layout.tsx                # 代理店権限チェック
│   │   └── portal/
│   │       ├── page.tsx             # サマリーダッシュボード
│   │       └── projects/page.tsx    # 案件一覧（閲覧のみ）
│   ├── api/v1/                       # APIルート
│   │   ├── customers/route.ts
│   │   ├── partners/route.ts
│   │   ├── projects/route.ts
│   │   ├── budgets/route.ts         # 予実管理API
│   │   └── notifications/route.ts   # 通知API
│   └── login/page.tsx
│
├── components/                       # 共通コンポーネント
│   ├── ui/                           # UIプリミティブ（shadcn/ui拡張）
│   │   ├── DataTable.tsx
│   │   ├── Modal.tsx
│   │   ├── StatusBadge.tsx
│   │   └── ...
│   ├── form/                         # フォーム関連
│   │   ├── FormField.tsx
│   │   ├── EntitySearch.tsx
│   │   ├── CurrencyInput.tsx
│   │   └── ...
│   ├── layout/                       # レイアウト
│   │   ├── AppLayout.tsx
│   │   ├── Sidebar.tsx
│   │   ├── PageHeader.tsx
│   │   └── BusinessSwitcher.tsx
│   └── templates/                    # 画面テンプレート
│       ├── EntityListTemplate.tsx    # inlineEditable でSpreadsheetTable/DataTableを切替
│       ├── EntityDetailTemplate.tsx
│       └── EntityFormTemplate.tsx
│
├── config/                           # エンティティ設定
│   └── entities/
│       ├── customer.ts               # 顧客の全設定（list/detail/form）
│       ├── partner.ts                # 代理店の全設定
│       └── project.ts               # 案件の全設定
│
├── hooks/                            # 共通フック
│   ├── useEntityList.ts              # 一覧取得・検索・ソート・ページネーション
│   ├── useEntityDetail.ts
│   ├── useEntityForm.ts
│   ├── useTablePreferences.ts        # ユーザー列設定のDB読込/デバウンス保存
│   ├── useInlineCellEdit.ts          # セル編集→PATCH→楽観的更新
│   ├── useCSVOperations.ts
│   ├── useNotifications.ts          # 通知管理
│   ├── useBudget.ts                 # 予実管理
│   ├── useAuth.ts
│   └── useBusiness.ts               # 現在選択中の事業
│
├── lib/                              # ユーティリティ
│   ├── apiClient.ts                  # 統一APIクライアント
│   ├── auth.ts                       # 認証ヘルパー
│   ├── validators.ts                 # Zodスキーマ
│   └── formatters.ts                 # 表示フォーマッタ
│
└── types/                            # 型定義
    ├── entities.ts                   # エンティティ型
    ├── api.ts                        # API型
    └── config.ts                     # 設定型
```

---

## 9. 新しいエンティティの追加手順

新しい管理対象（例: 「商品マスタ」）を追加する場合に必要な作業：

### ステップ1: 設定ファイルを作成
```
config/entities/product.ts
```

### ステップ2: ページファイルを作成（テンプレートを使うだけ）
```
app/(auth)/products/page.tsx
app/(auth)/products/[id]/page.tsx
app/(auth)/products/new/page.tsx
app/(auth)/products/[id]/edit/page.tsx
```

各ページの中身はこれだけ：
```typescript
// app/(auth)/products/page.tsx
import { EntityListTemplate } from "@/components/templates/EntityListTemplate";
import { productListConfig } from "@/config/entities/product";

export default function ProductListPage() {
  return <EntityListTemplate config={productListConfig} />;
}
```

### ステップ3: API ルートを作成
```
app/api/v1/products/route.ts
```

### ステップ4: Prismaスキーマにモデル追加

**コード変更は最小限。設定ファイルの追加が主な作業。**
