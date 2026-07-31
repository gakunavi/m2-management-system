'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type {
  EntityListConfig,
  PersistedColumnSettings,
  SavedViewSettings,
  SavedTableView,
} from '@/types/config';
import { useEntityList } from '@/hooks/use-entity-list';
import { useTablePreferences } from '@/hooks/use-table-preferences';
import { useInlineCellEdit } from '@/hooks/use-inline-cell-edit';
import { useSavedViews } from '@/hooks/use-saved-views';
import { useAuth } from '@/hooks/use-auth';
import { useBusiness } from '@/hooks/use-business';
import { PageHeader } from '@/components/layout/page-header';
import { SearchInput } from '@/components/form/search-input';
import { FilterPanel } from '@/components/ui/filter-bar';
import { CsvActions } from '@/components/ui/csv-actions';
import { BatchActionBar } from '@/components/ui/batch-action-bar';
import { ViewTabBar } from '@/components/ui/view-tab-bar';
import { SaveViewDialog } from '@/components/ui/save-view-dialog';
import { RenameViewDialog } from '@/components/ui/rename-view-dialog';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { DataTable } from '@/components/ui/data-table';
import { SpreadsheetTable } from '@/components/ui/spreadsheet-table';
import { Pagination } from '@/components/ui/pagination';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorDisplay } from '@/components/ui/error-display';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import type { UserRole } from '@/hooks/use-auth';

interface EntityListTemplateProps {
  config: EntityListConfig;
}

export function EntityListTemplate({ config }: EntityListTemplateProps) {
  const router = useRouter();
  const { hasRole, user } = useAuth();
  const userRole = user?.role;
  const { currentBusiness } = useBusiness();

  // 事業が選択されている場合、タイトルに事業名を付加（事業マスタ自身は除外）
  const displayTitle =
    currentBusiness && config.entityType !== 'business'
      ? `${config.title}：${currentBusiness.businessName}`
      : config.title;

  const {
    data,
    loading,
    error,
    pagination,
    setPage,
    setPageSize,
    searchQuery,
    setSearchQuery,
    filters,
    setFilter,
    clearFilters,
    setFilters,
    sortItems,
    setSort,
    setSortItems,
    refresh,
    queryKey,
    viewId: activeViewId,
    setViewId: setActiveViewId,
  } = useEntityList(config);

  const { preferences, savePreferences, isLoading: prefsLoading } =
    useTablePreferences(config.tableSettings.persistKey);
  // stale closure 防止: handlePageSizeChange から最新の preferences を参照
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;

  const { updateCell } = useInlineCellEdit(config);

  // ============================================
  // 保存済みビュー
  // ============================================
  const {
    views,
    myViews,
    isLoading: viewsLoading,
    defaultView,
    createView,
    renameView,
    updateViewSettings,
    setDefaultView,
    toggleShareView,
    copySharedView,
    deleteView,
    isCreating,
    isUpdating,
    isDeleting,
  } = useSavedViews(config.tableSettings.persistKey);

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<SavedTableView | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedTableView | null>(null);

  // URL に一覧の状態（絞り込み・ソート・ページ・検索）が載っているか。
  // 詳細画面からの「戻る」やブックマークで復元された状態を、デフォルトビューの
  // 自動適用で上書きしないための判定。初回マウント時の値のみを見る。
  const searchParams = useSearchParams();
  const hasUrlStateRef = useRef<boolean | null>(null);
  if (hasUrlStateRef.current === null) {
    hasUrlStateRef.current =
      ['page', 'pageSize', 'search', 'sort', 'sortField', 'view'].some((k) =>
        searchParams.has(k),
      ) || Array.from(searchParams.keys()).some((k) => k.startsWith('filter['));
  }

  // 初回ロード: 保存済み pageSize をグローバル設定から復元
  // URL に pageSize がある場合はそちらを優先（戻る操作での復元を壊さない）
  const pageSizeAppliedRef = useRef(false);
  useEffect(() => {
    if (pageSizeAppliedRef.current || prefsLoading) return;
    pageSizeAppliedRef.current = true;
    if (searchParams.has('pageSize')) return;
    if (preferences?.pageSize) setPageSize(preferences.pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsLoading, preferences?.pageSize]);

  // ============================================
  // 列設定のスコープ分離
  // ============================================
  // グローバル設定（user-preferences/table）は「すべて」タブ専用の状態として扱い、
  // ビュー選択中の列設定はビュー側（saved-views）にのみ保存する。
  // 以前は両者が同じレコードを共有していたため、一度ビューを適用すると
  // 「すべて」タブがビューの列構成のままになっていた。
  const activeView = useMemo(
    () => (activeViewId !== null ? views.find((v) => v.id === activeViewId) ?? null : null),
    [activeViewId, views],
  );

  // 共有ビュー（他人のビュー = 読み取り専用）はセッション内のみのローカル上書きを持つ
  const [sharedViewPrefs, setSharedViewPrefs] = useState<PersistedColumnSettings | null>(null);
  useEffect(() => {
    setSharedViewPrefs(null);
  }, [activeViewId]);

  /** テーブルに渡す実効的な列設定 */
  const effectivePreferences = useMemo<PersistedColumnSettings | null>(() => {
    if (!activeView) return preferences;
    if (activeView.ownerName && sharedViewPrefs) return sharedViewPrefs;
    return (activeView.settings as SavedViewSettings).columnSettings ?? preferences;
  }, [activeView, preferences, sharedViewPrefs]);

  // stale closure 防止用
  const effectivePreferencesRef = useRef(effectivePreferences);
  effectivePreferencesRef.current = effectivePreferences;

  /**
   * 「すべて」タブでは config の全列を強制表示する。
   * （非表示設定を持つのはビューのみ。列を絞り込みたい場合はビューを作成する）
   */
  const forceAllColumnsVisible = activeView === null;

  // デフォルトビューの自動適用（初回ロード時のみ）
  // - preferences のロード完了を待つ（グローバル設定の確定を先に済ませるため）
  // - URL に一覧状態がある場合は適用しない（詳細画面からの戻りを尊重）
  const defaultAppliedRef = useRef(false);
  useEffect(() => {
    if (viewsLoading || prefsLoading || defaultAppliedRef.current) return;
    defaultAppliedRef.current = true;
    if (defaultView && !hasUrlStateRef.current) {
      applyViewState(defaultView);
      setActiveViewId(defaultView.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewsLoading, prefsLoading]);

  /** 現在のテーブル状態をスナップショットとして取得 */
  const snapshotCurrentState = useCallback((): SavedViewSettings => {
    const base: PersistedColumnSettings = effectivePreferences ?? {
      columnOrder: [],
      columnVisibility: {},
      columnWidths: {},
      sortState: [],
      columnPinning: { left: [] },
    };
    // 「すべて」タブから保存する場合、画面と同じ「全列表示」を初期状態にする
    const columnSettings: PersistedColumnSettings = forceAllColumnsVisible
      ? {
          ...base,
          columnVisibility: Object.fromEntries(
            config.columns.map((c) => [c.key, true]),
          ),
        }
      : base;
    return {
      columnSettings,
      filters,
      sortItems,
      searchQuery,
      pageSize: pagination.pageSize,
    };
  }, [
    effectivePreferences,
    forceAllColumnsVisible,
    config.columns,
    filters,
    sortItems,
    searchQuery,
    pagination.pageSize,
  ]);

  /**
   * ビューの保存済み状態を一覧の絞り込み系フックに適用する。
   * 列設定はビュー側に保持されるため（effectivePreferences 参照）、
   * ここでグローバル設定を書き換えないこと。
   */
  const applyViewState = useCallback(
    (view: SavedTableView) => {
      const s = view.settings as SavedViewSettings;
      setSearchQuery(s.searchQuery);
      const viewPageSize = s.pageSize ?? s.columnSettings?.pageSize;
      if (viewPageSize) setPageSize(viewPageSize);
      setFilters(s.filters);
      setSortItems(s.sortItems);
    },
    [setSearchQuery, setPageSize, setFilters, setSortItems],
  );

  /** タブ切替 */
  const handleSelectView = useCallback(
    (id: number | null) => {
      setActiveViewId(id);

      if (id === null) {
        // 「すべて」に切替: ビュー由来の絞り込み・検索を解除し、
        // 表示件数・ソートはグローバル設定（= 「すべて」自身の状態）に戻す。
        // 列設定は effectivePreferences が自動的にグローバル設定を参照する。
        const base = preferencesRef.current;
        clearFilters();
        setSearchQuery('');
        if (base?.pageSize) setPageSize(base.pageSize);
        if (base?.sortState && base.sortState.length > 0) setSortItems(base.sortState);
        return;
      }
      const view = views.find((v) => v.id === id);
      if (view) applyViewState(view);
    },
    [views, applyViewState, clearFilters, setSearchQuery, setPageSize, setSortItems, setActiveViewId],
  );

  /** ビュー保存 */
  const handleSaveView = useCallback(
    async (name: string, setAsDefault: boolean, isShared: boolean) => {
      const settings = snapshotCurrentState();
      const created = await createView(name, settings, setAsDefault, isShared);
      setActiveViewId(created.id);
    },
    [snapshotCurrentState, createView, setActiveViewId],
  );

  /** ビュー複製 */
  const handleDuplicateView = useCallback(
    async (id: number) => {
      const view = views.find((v) => v.id === id);
      if (!view) return;
      const created = await createView(
        `${view.viewName}（コピー）`,
        view.settings as SavedViewSettings,
        false,
        false,
      );
      setActiveViewId(created.id);
    },
    [views, createView, setActiveViewId],
  );

  /** 共有トグル */
  const handleToggleShare = useCallback(
    async (id: number, isShared: boolean) => {
      await toggleShareView(id, isShared);
    },
    [toggleShareView],
  );

  /** 共有ビューをコピー */
  const handleCopySharedView = useCallback(
    async (view: SavedTableView) => {
      const created = await copySharedView(view);
      setActiveViewId(created.id);
      applyViewState(created);
    },
    [copySharedView, applyViewState, setActiveViewId],
  );

  /**
   * 列設定変更時のラッパー。保存先はアクティブなタブによって切り替える。
   * - 「すべて」タブ: グローバル設定（user-preferences/table）
   * - 自分のビュー  : ビューの columnSettings
   * - 共有ビュー    : 読み取り専用のためセッション内のローカル状態のみ
   */
  const savePreferencesWithView = useCallback(
    (settings: PersistedColumnSettings) => {
      if (!activeView) {
        savePreferences(settings);
        return;
      }
      if (activeView.ownerName) {
        setSharedViewPrefs(settings);
        return;
      }
      updateViewSettings(activeView.id, {
        ...(activeView.settings as SavedViewSettings),
        columnSettings: settings,
      });
    },
    [savePreferences, activeView, updateViewSettings],
  );

  /** 表示件数変更時のラッパー: 現在のタブのスコープに保存 */
  const handlePageSizeChange = useCallback(
    (size: number) => {
      setPageSize(size);
      // stale closure 防止のため ref / 実効設定から最新値を組み立てる
      const latest = effectivePreferencesRef.current;
      const updatedPrefs: PersistedColumnSettings = {
        columnOrder: latest?.columnOrder ?? [],
        columnVisibility: latest?.columnVisibility ?? {},
        columnWidths: latest?.columnWidths ?? {},
        sortState: latest?.sortState ?? [],
        columnPinning: latest?.columnPinning,
        pageSize: size,
      };

      if (!activeView) {
        savePreferences(updatedPrefs);
        return;
      }
      if (activeView.ownerName) {
        setSharedViewPrefs(updatedPrefs);
        return;
      }
      updateViewSettings(activeView.id, {
        ...(activeView.settings as SavedViewSettings),
        columnSettings: updatedPrefs,
        pageSize: size,
      });
    },
    [setPageSize, savePreferences, activeView, updateViewSettings],
  );

  // ============================================
  // 一括選択の状態管理
  // ============================================
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const handleSelectRow = useCallback((id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedIds(new Set(data.map((row) => (row as Record<string, unknown>).id as number)));
      } else {
        setSelectedIds(new Set());
      }
    },
    [data],
  );

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // データが変わったら選択もクリア
  const prevDataRef = useRef(data);
  useEffect(() => {
    if (prevDataRef.current !== data && selectedIds.size > 0) {
      setSelectedIds(new Set());
    }
    prevDataRef.current = data;
  }, [data, selectedIds.size]);

  // 権限による新規作成ボタンの制御
  const hideCreate = config.permissions?.hideCreateButton?.some((role) =>
    hasRole(role as UserRole),
  );

  // CSV エクスポート時に現在の検索/フィルター/ソート条件を渡す
  const csvExportParams = useMemo(() => {
    const params: Record<string, string> = {};
    if (searchQuery) params.search = searchQuery;
    for (const [key, value] of Object.entries(filters)) {
      if (value) params[`filter[${key}]`] = value;
    }
    if (sortItems.length > 0) {
      params.sort = sortItems.map((s) => `${s.field}:${s.direction}`).join(',');
    }
    return params;
  }, [searchQuery, filters, sortItems]);

  // 現在の表示列キー（列順反映・内部列除外 → CSVキーに変換）
  const visibleColumnKeys = useMemo(() => {
    const allKeys = config.columns.map((c) => c.key);
    const order = effectivePreferences?.columnOrder ?? allKeys;
    const visibility = effectivePreferences?.columnVisibility ?? {};
    const keyMap = config.csv?.columnKeyMap ?? {};

    const visibleKeys = order.filter((key) => {
      // 内部列（_select, _open）を除外
      if (key.startsWith('_')) return false;
      const col = config.columns.find((c) => c.key === key);
      // customPatch列: columnKeyMapに登録されていなければCSVに存在しないため除外
      if (col?.customPatch && !(key in keyMap)) return false;
      // 「すべて」タブは全列強制表示なので、CSV も全列を対象にする
      if (forceAllColumnsVisible) return true;
      // visibility に key がなければ config の defaultVisible を参照
      if (key in visibility) return visibility[key];
      return col?.defaultVisible !== false;
    });

    // テーブル列キー → CSVキーに変換（マッピングがある場合）
    return visibleKeys.map((key) => keyMap[key] ?? key);
  }, [config.columns, config.csv?.columnKeyMap, effectivePreferences, forceAllColumnsVisible]);

  const hasBatchActions = (config.batchActions?.length ?? 0) > 0;
  const selectedIdList = useMemo(() => Array.from(selectedIds), [selectedIds]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={displayTitle}
        actions={
          <div className="flex items-center gap-2">
            {config.csv && (
              <CsvActions
                endpoint={config.csv.endpoint}
                importEnabled={config.csv.importEnabled}
                exportEnabled={config.csv.exportEnabled}
                exportParams={csvExportParams}
                onImportComplete={refresh}
                templateColumns={config.csv.templateColumns}
                visibleColumnKeys={visibleColumnKeys}
              />
            )}
            {!hideCreate && config.createAction && config.createAction.render()}
            {!hideCreate && !config.createAction && config.createPath && (
              <Button onClick={() => router.push(config.createPath!)}>
                <Plus className="mr-2 h-4 w-4" />
                新規作成
              </Button>
            )}
          </div>
        }
      />

      <div className="flex items-center gap-4">
        <div className="w-80">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={config.search.placeholder}
          />
        </div>
      </div>

      {/* ビュータブバー */}
      <ViewTabBar
        views={views}
        activeViewId={activeViewId}
        onSelectView={handleSelectView}
        onSaveClick={() => setSaveDialogOpen(true)}
        onRenameView={(id) =>
          setRenameTarget(views.find((v) => v.id === id) ?? null)
        }
        onDeleteView={(id) =>
          setDeleteTarget(views.find((v) => v.id === id) ?? null)
        }
        onSetDefault={(id) => setDefaultView(id)}
        onDuplicateView={handleDuplicateView}
        onToggleShare={handleToggleShare}
        onCopySharedView={handleCopySharedView}
        isLoading={viewsLoading}
        atLimit={myViews.length >= 10}
      />

      {config.renderBeforeTable?.({ filters, setFilter })}

      {hasBatchActions && selectedIds.size > 0 && (
        <BatchActionBar
          selectedIds={selectedIdList}
          actions={config.batchActions!}
          onClearSelection={clearSelection}
          onComplete={refresh}
          userRole={userRole}
        />
      )}

      {error ? (
        <ErrorDisplay message={error.message} onRetry={refresh} />
      ) : config.inlineEditable ? (
        loading ? (
          <LoadingSpinner />
        ) : data.length === 0 ? (
          <EmptyState
            title="データがありません"
            description="条件を変更するか、新しいデータを登録してください"
            action={
              !hideCreate && !config.createAction && config.createPath
                ? { label: '新規作成', onClick: () => router.push(config.createPath!) }
                : undefined
            }
          />
        ) : (
          <>
            <SpreadsheetTable
              columns={config.columns}
              data={data as Record<string, unknown>[]}
              config={config}
              sortItems={sortItems}
              onSort={setSort}
              loading={loading}
              preferences={effectivePreferences}
              savePreferences={savePreferencesWithView}
              updateCell={updateCell}
              queryKey={queryKey}
              filters={config.filters}
              activeFilters={filters}
              onFilterChange={setFilter}
              onClearFilters={clearFilters}
              selectedIds={hasBatchActions ? selectedIds : undefined}
              onSelectRow={hasBatchActions ? handleSelectRow : undefined}
              onSelectAll={hasBatchActions ? handleSelectAll : undefined}
              pageSize={pagination.pageSize}
              onSortItemsSet={setSortItems}
              onPageSizeSet={setPageSize}
              columnGroupOrder={config.columnGroupOrder}
              forceAllColumnsVisible={forceAllColumnsVisible}
            />
            <Pagination
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              pageSize={pagination.pageSize}
              total={pagination.total}
              onPageChange={setPage}
              onPageSizeChange={handlePageSizeChange}
            />
          </>
        )
      ) : (
        <>
          {config.filters.length > 0 && (
            <div className="flex items-center justify-end">
              <FilterPanel
                filters={config.filters}
                activeFilters={filters}
                onFilterChange={setFilter}
                onClearAll={clearFilters}
              />
            </div>
          )}

          {loading ? (
            <LoadingSpinner />
          ) : data.length === 0 ? (
            <EmptyState
              title="データがありません"
              description="条件を変更するか、新しいデータを登録してください"
              action={
                !hideCreate && config.createPath
                  ? { label: '新規作成', onClick: () => router.push(config.createPath!) }
                  : undefined
              }
            />
          ) : (
            <>
              <DataTable
                columns={config.columns}
                data={data as Record<string, unknown>[]}
                onRowClick={(row) => router.push(config.detailPath(row.id as number))}
                sortItems={sortItems}
                onSort={setSort}
                selectedIds={hasBatchActions ? selectedIds : undefined}
                onSelectRow={hasBatchActions ? handleSelectRow : undefined}
                onSelectAll={hasBatchActions ? handleSelectAll : undefined}
              />
              <Pagination
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
                pageSize={pagination.pageSize}
                total={pagination.total}
                onPageChange={setPage}
                onPageSizeChange={handlePageSizeChange}
              />
            </>
          )}
        </>
      )}

      {/* ビュー保存ダイアログ */}
      <SaveViewDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        onSave={handleSaveView}
        isSaving={isCreating}
        atLimit={views.length >= 10}
      />

      {/* ビュー名変更ダイアログ */}
      {renameTarget && (
        <RenameViewDialog
          open={!!renameTarget}
          onOpenChange={(open) => {
            if (!open) setRenameTarget(null);
          }}
          currentName={renameTarget.viewName}
          onSave={async (newName) => {
            await renameView(renameTarget.id, newName);
            setRenameTarget(null);
          }}
          isSaving={isUpdating}
        />
      )}

      {/* ビュー削除確認 */}
      <ConfirmModal
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="ビューを削除"
        description={`「${deleteTarget?.viewName ?? ''}」を削除しますか？`}
        confirmLabel="削除"
        variant="destructive"
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteView(deleteTarget.id);
          if (activeViewId === deleteTarget.id) setActiveViewId(null);
          setDeleteTarget(null);
        }}
        isLoading={isDeleting}
      />
    </div>
  );
}
