import { ReactNode } from 'react';

// ============================================
// 共通型
// ============================================

export type CellEditorType =
  | 'text'
  | 'number'
  | 'select'
  | 'master-select'
  | 'date'
  | 'month'
  | 'email'
  | 'phone'
  | 'url'
  | 'textarea'
  | 'checkbox';

export type CellEditConfig = {
  type: CellEditorType;
  options?: { value: string; label: string }[];
  /** master-select 用: マスタ取得エンドポイント（例: '/industries'） */
  optionsEndpoint?: string;
  /** master-select 用: ラベルフィールド名（例: 'industryName'） */
  labelField?: string;
  validate?: (value: unknown) => { success: boolean; error?: string };
  placeholder?: string;
};

/** インライン編集で通常の PATCH 先と異なるエンドポイントに送信する設定 */
export type CustomPatchConfig = {
  /** PATCH エンドポイントを生成する関数。row から対象レコードの ID を取得して構築 */
  endpoint: (row: Record<string, unknown>) => string;
  /** API に送信するフィールド名（列の key と異なる場合に指定） */
  field: string;
  /** PATCH 後にリスト全体を再取得する（デフォルト: true） */
  refetchOnSuccess?: boolean;
};

export type ColumnDef = {
  key: string;
  label: string;
  width?: number;
  minWidth?: number;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  render?: (value: unknown, row: Record<string, unknown>) => ReactNode;
  defaultVisible?: boolean;
  locked?: boolean;
  /** インライン編集設定。undefined の場合は読み取り専用 */
  edit?: CellEditConfig;
  /** 通常の patchEndpoint ではなく別 API に PATCH する設定 */
  customPatch?: CustomPatchConfig;
};

// ============================================
// フィルター定義（判別共用体）
// ============================================

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
type NumberRangeFilterDef = FilterDefBase & {
  type: 'number-range';
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
};
type BooleanFilterDef = FilterDefBase & {
  type: 'boolean';
  trueLabel?: string;
  falseLabel?: string;
};
type CheckboxGroupFilterDef = FilterDefBase & { type: 'checkbox-group' } & FilterOptionSource;
type DateFilterDef = FilterDefBase & { type: 'date' };
type MonthFilterDef = FilterDefBase & { type: 'month' };

export type FilterDef =
  | SelectFilterDef
  | MultiSelectFilterDef
  | TextFilterDef
  | DateRangeFilterDef
  | NumberRangeFilterDef
  | BooleanFilterDef
  | CheckboxGroupFilterDef
  | DateFilterDef
  | MonthFilterDef;

// ============================================
// テーブル設定の永続化
// ============================================

export type PersistedColumnSettings = {
  columnOrder: string[];
  columnVisibility: Record<string, boolean>;
  columnWidths: Record<string, number>;
  sortState: { field: string; direction: 'asc' | 'desc' }[];
  /** 左固定列の列IDリスト（Excel風の列固定） */
  columnPinning?: { left: string[] };
  /** 1ページあたりの表示件数 */
  pageSize?: number;
};

// ============================================
// EntityListConfig
// ============================================

export type EntityListConfig = {
  entityType: string;
  apiEndpoint: string;
  title: string;
  columns: ColumnDef[];
  search: {
    placeholder: string;
    fields: string[];
    debounceMs?: number;
  };
  filters: FilterDef[];
  defaultSort: {
    field: string;
    direction: 'asc' | 'desc';
  } | {
    field: string;
    direction: 'asc' | 'desc';
  }[];
  tableSettings: {
    persistKey: string;
    defaultPageSize: 10 | 25 | 50 | 100;
    defaultDensity: 'compact' | 'normal' | 'comfortable';
    columnReorderEnabled: boolean;
    columnToggleEnabled: boolean;
  };
  detailPath: (id: number) => string;
  /** 新規作成ページのパス。undefined の場合は新規作成ボタンを非表示 */
  createPath?: string;
  /** createPath の代わりにカスタムボタンを表示（事業選択時の紐付けモーダル等） */
  createAction?: {
    label: string;
    render: () => ReactNode;
  };
  businessScoped?: boolean;
  permissions?: {
    hideCreateButton?: string[];
  };
  /** インライン編集を有効にする */
  inlineEditable?: boolean;
  /** PATCH API エンドポイント（例: (id) => `/customers/${id}`） */
  patchEndpoint?: (id: number) => string;
  /** CSV エクスポート/インポート設定 */
  csv?: CsvConfig;
  /** 一括操作定義（チェックボックス選択 + バッチアクション） */
  batchActions?: BatchActionDef[];
  /** テーブル上部に表示するカスタムフィルターUI用スロット */
  renderBeforeTable?: (props: {
    filters: Record<string, string>;
    setFilter: (key: string, value: string) => void;
  }) => ReactNode;
};

// ============================================
// CSV インポート/エクスポート設定
// ============================================

export type CsvImportMode = 'create_only' | 'upsert';

export type CsvTemplateColumn = {
  /** CSVヘッダーのキー（APIのCSV_HEADERSのlabelに対応） */
  key: string;
  /** CSVヘッダーのラベル */
  label: string;
  /** 必須項目フラグ */
  required?: boolean;
  /** 入力説明（プレビュー画面のヘルプ表示用） */
  description?: string;
  /** 入力例（テンプレートの2行目に表示） */
  example?: string;
};

export type CsvConfig = {
  importEnabled: boolean;
  exportEnabled: boolean;
  /** エクスポート/インポート共通のベースエンドポイント（例: '/customers/csv'） */
  endpoint: string;
  /** テンプレートDL用の列定義。指定するとテンプレートDLボタンが表示される */
  templateColumns?: CsvTemplateColumn[];
  /** テーブル列キー → CSVキーのマッピング（キーが異なる場合のみ指定） */
  columnKeyMap?: Record<string, string>;
};

// ============================================
// 一括操作定義
// ============================================

export type BatchActionDef = {
  key: string;
  label: string;
  icon?: string;
  variant?: 'default' | 'destructive';
  confirm?: {
    title: string;
    message: string | ((count: number) => string);
  };
  inputConfig?: {
    type: 'select' | 'text';
    label: string;
    optionsEndpoint?: string;
  };
  /** POST 先エンドポイント（例: '/customers/batch/delete'） */
  apiEndpoint: string;
  onComplete?: 'refresh' | 'redirect';
  requiredRole?: string[];
};

// ============================================
// EntityDetailConfig
// ============================================

export type EntityDetailConfig = {
  entityType: string;
  /** ページパスのベース（例: '/businesses'）。省略時は `/${entityType}s` を使用 */
  basePath?: string;
  apiEndpoint: (id: string) => string;
  title: (data: Record<string, unknown>) => string;
  tabs: TabDef[];
  actions: {
    edit: boolean;
    delete: boolean;
    /** 論理削除の復元設定。設定すると削除済みデータに「復元」ボタンを表示 */
    restore?: {
      /** 有効/無効を判定するフィールド名（例: 'customerIsActive'） */
      activeField: string;
      /** 復元 API エンドポイント（例: (id) => `/customers/${id}/restore`） */
      apiEndpoint: (id: string) => string;
      /** 復元に必要なロール。省略時は全ロール許可 */
      requiredRole?: string[];
    };
  };
};

export type TabDef = {
  key: string;
  label: string;
  component: 'info' | 'related' | 'contacts' | 'files' | 'custom';
  config: InfoTabConfig | RelatedTabConfig | Record<string, unknown>;
};

export type InfoTabConfig = {
  sections: {
    title: string;
    columns?: 1 | 2;
    fields: FieldDisplayDef[];
  }[];
};

export type FieldDisplayDef = {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'currency' | 'date' | 'email' | 'phone' | 'url' | 'status' | 'boolean';
  colSpan?: 1 | 2;
  render?: (value: unknown, data: Record<string, unknown>) => ReactNode;
};

export type RelatedTabConfig = {
  apiEndpoint: (parentId: string) => string;
  columns: ColumnDef[];
  detailPath?: (id: number) => string;
  showCount?: boolean;
};

// ============================================
// EntityFormConfig
// ============================================

export type EntityFormConfig = {
  entityType: string;
  apiEndpoint: string;
  title: { create: string; edit: string };
  sections: FormSectionDef[];
  validationSchema: unknown; // Zod schema
  redirectAfterSave: (id: number) => string;
  warnOnLeave?: boolean;
  /** 新規作成時にAPIへ送信する隠しフィールド（UIに表示しない） */
  defaultValues?: Record<string, unknown>;
};

export type FormSectionDef = {
  title: string;
  columns?: 1 | 2 | 3;
  fields: FormFieldDef[];
};

/** マスタ選択フィールド設定 */
export type MasterSelectConfig = {
  /** マスタ API エンドポイント（例: '/industries'） */
  endpoint: string;
  /** 選択肢のラベルフィールド（例: 'industryName'） */
  labelField: string;
  /** モーダルのタイトル（例: '業種管理'） */
  modalTitle: string;
};

/** 類似データチェック設定（フォームフィールド用） */
export type DuplicateCheckConfig = {
  /** 検索先の API エンドポイント（例: '/customers'） */
  endpoint: string;
  /** 検索結果から表示するラベルフィールド（例: 'customerName'） */
  labelField: string;
  /** デバウンス時間（ms）。デフォルト 500 */
  debounceMs?: number;
  /** チェック発動の最小文字数。デフォルト 2 */
  minLength?: number;
  /** 複合フィールド重複チェック: 追加フィールドを組み合わせて検証 */
  comboFields?: { formKey: string; paramKey: string }[];
};

/** 親代理店選択フィールド設定 */
export type PartnerSelectConfig = {
  /** 候補取得 API エンドポイント（例: '/partners/candidates'） */
  candidatesEndpoint: string;
  /** partnerTier → 親の階層ラベルのマッピング（例: { '2次代理店': '1次代理店' }） */
  parentTierMapping: Record<string, string>;
};

/** エンティティ選択フィールド設定（検索付きドロップダウン） */
export type EntitySelectConfig = {
  /** 検索 API エンドポイント（例: '/customers'） */
  endpoint: string;
  /** 表示名フィールド（例: 'customerName'） */
  labelField: string;
  /** コードフィールド（例: 'customerCode'、表示用サブテキスト） */
  codeField?: string;
  /** 検索プレースホルダー */
  searchPlaceholder?: string;
};

/** ファイルアップロードフィールド設定 */
export type FileUploadConfig = {
  /** 保存先ディレクトリ（例: 'bp-forms'） */
  directory: string;
  /** accept 属性（例: 'application/pdf'） */
  accept?: string;
  /** 説明テキスト（例: 'PDF, 5MB以内'） */
  description?: string;
  /** ストレージキーを保存するフィールド名（例: 'partnerBpFormKey'） */
  keyField: string;
};

export type FormFieldDef = {
  key: string;
  label: string;
  type:
    | 'text'
    | 'number'
    | 'select'
    | 'date'
    | 'month'
    | 'textarea'
    | 'email'
    | 'phone'
    | 'url'
    | 'checkbox'
    | 'readonly'
    | 'master-select'
    | 'partner-select'
    | 'file-upload'
    | 'entity-select';
  required?: boolean;
  placeholder?: string;
  /** フィールドの入力ヒント・補足説明 */
  description?: string;
  disabled?: boolean;
  /** 編集モード時のみ disabled にする（新規作成時は入力可能） */
  disabledOnEdit?: boolean;
  options?: { value: string; label: string }[];
  optionsEndpoint?: string;
  colSpan?: 1 | 2 | 3;
  /** 類似データの重複チェック設定。設定があるフィールドは入力中に自動チェック */
  duplicateCheck?: DuplicateCheckConfig;
  /** マスタ選択フィールド設定（type='master-select' の場合必須） */
  masterSelect?: MasterSelectConfig;
  /** 親代理店選択フィールド設定（type='partner-select' の場合必須） */
  partnerSelect?: PartnerSelectConfig;
  /** ファイルアップロード設定（type='file-upload' の場合必須） */
  fileUpload?: FileUploadConfig;
  /** エンティティ選択設定（type='entity-select' の場合必須） */
  entitySelect?: EntitySelectConfig;
  /** フォームデータに応じて表示/非表示を切り替える条件 */
  visibleWhen?: (formData: Record<string, unknown>) => boolean;
};

// ============================================
// 保存済みテーブルビュー
// ============================================

/** ビューに保存される全テーブル状態 */
export type SavedViewSettings = {
  columnSettings: PersistedColumnSettings;
  filters: Record<string, string>;
  sortItems: { field: string; direction: 'asc' | 'desc' }[];
  searchQuery: string;
  pageSize: number;
};

/** APIから返される保存済みビュー */
export type SavedTableView = {
  id: number;
  userId: number;
  tableKey: string;
  viewName: string;
  settings: SavedViewSettings;
  displayOrder: number;
  isDefault: boolean;
  isShared: boolean;
  /** 共有ビューの作成者名（他人の共有ビューのみ） */
  ownerName?: string;
  createdAt: string;
  updatedAt: string;
};
