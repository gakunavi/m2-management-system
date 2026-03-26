'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  } = useEntityList(config);

  const { preferences, savePreferences } = useTablePreferences(
    config.tableSettings.persistKey,
  );
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

  const [activeViewId, setActiveViewId] = useState<number | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<SavedTableView | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedTableView | null>(null);

  // 初回ロード: 保存済み pageSize をグローバル設定から復元
  const pageSizeAppliedRef = useRef(false);
  useEffect(() => {
    if (pageSizeAppliedRef.current || !preferences?.pageSize) return;
    pageSizeAppliedRef.current = true;
    setPageSize(preferences.pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences?.pageSize]);

  // 「すべて」タブの設定を退避する Ref（ビュー切替前に保存）
  const basePrefsRef = useRef<PersistedColumnSettings | null>(null);

  // 初回プリファレンスロード時に「すべて」のベース状態を保存
  const baseCapturedRef = useRef(false);
  useEffect(() => {
    if (baseCapturedRef.current || !preferences) return;
    baseCapturedRef.current = true;
    basePrefsRef.current = { ...preferences };
  }, [preferences]);

  // デフォルトビューの自動適用（初回ロード時のみ）
  const defaultAppliedRef = useRef(false);
  useEffect(() => {
    if (viewsLoading || defaultAppliedRef.current) return;
    defaultAppliedRef.current = true;
    if (defaultView) {
      applyViewState(defaultView);
      setActiveViewId(defaultView.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewsLoading]);

  /** 現在のテーブル状態をスナップショットとして取得 */
  const snapshotCurrentState = useCallback((): SavedViewSettings => ({
    columnSettings: preferences ?? {
      columnOrder: [],
      columnVisibility: {},
      columnWidths: {},
      sortState: [],
      columnPinning: { left: [] },
    },
    filters,
    sortItems,
    searchQuery,
    pageSize: pagination.pageSize,
  }), [preferences, filters, sortItems, searchQuery, pagination.pageSize]);

  /** ビューの保存済み状態を全フックに適用 */
  const applyViewState = useCallback(
    (view: SavedTableView) => {
      const s = view.settings as SavedViewSettings;
      // ビューに columnPinning がない場合はピンなし（他ビューのピンを引き継がない）
      const mergedSettings: PersistedColumnSettings = {
        ...s.columnSettings,
        columnPinning: s.columnSettings.columnPinning ?? { left: [] },
        pageSize: s.pageSize ?? s.columnSettings.pageSize,
      };
      savePreferences(mergedSettings);
      setSearchQuery(s.searchQuery);
      if (s.pageSize) setPageSize(s.pageSize);
      setFilters(s.filters);
      setSortItems(s.sortItems);
    },
    [savePreferences, setSearchQuery, setPageSize, setFilters, setSortItems],
  );

  /** タブ切替 */
  const handleSelectView = useCallback(
    (id: number | null) => {
      // 「すべて」からビューに切り替える場合、現在の状態を退避
      if (activeViewId === null && id !== null && preferences) {
        basePrefsRef.current = { ...preferences };
      }

      setActiveViewId(id);

      if (id === null) {
        // 「すべて」に切替: 退避した状態を復元 + フィルタリセット
        if (basePrefsRef.current) {
          savePreferences(basePrefsRef.current);
          if (basePrefsRef.current.pageSize) {
            setPageSize(basePrefsRef.current.pageSize);
          }
        }
        clearFilters();
        return;
      }
      const view = views.find((v) => v.id === id);
      if (view) applyViewState(view);
    },
    [activeViewId, views, applyViewState, clearFilters, preferences, savePreferences, setPageSize],
  );

  /** ビュー保存 */
  const handleSaveView = useCallback(
    async (name: string, setAsDefault: boolean, isShared: boolean) => {
      const settings = snapshotCurrentState();
      const created = await createView(name, settings, setAsDefault, isShared);
      setActiveViewId(created.id);
    },
    [snapshotCurrentState, createView],
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
    [views, createView],
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
    [copySharedView, applyViewState],
  );

  /** 列設定変更時のラッパー: アクティブビューにも反映（共有ビューは読み取り専用） */
  const savePreferencesWithView = useCallback(
    (settings: PersistedColumnSettings) => {
      savePreferences(settings);
      if (activeViewId !== null) {
        const view = views.find((v) => v.id === activeViewId);
        if (view && !view.ownerName) {
          updateViewSettings(activeViewId, {
            ...(view.settings as SavedViewSettings),
            columnSettings: settings,
          });
        }
      }
    },
    [savePreferences, activeViewId, views, updateViewSettings],
  );

  /** 表示件数変更時のラッパー: グローバル設定 + アクティブビューに保存 */
  const handlePageSizeChange = useCallback(
    (size: number) => {
      setPageSize(size);
      // ref 経由で最新の preferences を取得（stale closure 防止）
      const latest = preferencesRef.current;
      const updatedPrefs: PersistedColumnSettings = {
        columnOrder: latest?.columnOrder ?? [],
        columnVisibility: latest?.columnVisibility ?? {},
        columnWidths: latest?.columnWidths ?? {},
        sortState: latest?.sortState ?? [],
        columnPinning: latest?.columnPinning,
        pageSize: size,
      };
      savePreferences(updatedPrefs);
      // 「すべて」タブのベース状態も更新
      if (activeViewId === null && basePrefsRef.current) {
        basePrefsRef.current = { ...basePrefsRef.current, pageSize: size };
      }
      // アクティブビューにも反映（共有ビューは読み取り専用）
      if (activeViewId !== null) {
        const view = views.find((v) => v.id === activeViewId);
        if (view && !view.ownerName) {
          updateViewSettings(activeViewId, {
            ...(view.settings as SavedViewSettings),
            columnSettings: updatedPrefs,
            pageSize: size,
          });
        }
      }
    },
    [setPageSize, savePreferences, activeViewId, views, updateViewSettings],
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
    const order = preferences?.columnOrder ?? allKeys;
    const visibility = preferences?.columnVisibility ?? {};
    const keyMap = config.csv?.columnKeyMap ?? {};

    const visibleKeys = order.filter((key) => {
      // 内部列（_select, _open）を除外
      if (key.startsWith('_')) return false;
      const col = config.columns.find((c) => c.key === key);
      // customPatch列: columnKeyMapに登録されていなければCSVに存在しないため除外
      if (col?.customPatch && !(key in keyMap)) return false;
      // visibility に key がなければ config の defaultVisible を参照
      if (key in visibility) return visibility[key];
      return col?.defaultVisible !== false;
    });

    // テーブル列キー → CSVキーに変換（マッピングがある場合）
    return visibleKeys.map((key) => keyMap[key] ?? key);
  }, [config.columns, config.csv?.columnKeyMap, preferences]);

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
              preferences={preferences}
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
