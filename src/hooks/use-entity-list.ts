'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { EntityListConfig } from '@/types/config';
import type { SortItem } from '@/types/api';
import { useDebounce } from './use-debounce';

/** Config の defaultSort を正規化して SortItem[] にする */
function normalizeDefaultSort(
  defaultSort: EntityListConfig['defaultSort'],
): SortItem[] {
  return Array.isArray(defaultSort) ? defaultSort : [defaultSort];
}

export function useEntityList(config: EntityListConfig) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const defaultSortItems = normalizeDefaultSort(config.defaultSort);
  const defaultPageSize = config.tableSettings.defaultPageSize;

  // URL → State 初期化（複数列ソート対応）
  const [page, setPage] = useState(Number(searchParams.get('page')) || 1);
  const [pageSize, setPageSize] = useState(
    Number(searchParams.get('pageSize')) || defaultPageSize,
  );
  const [searchQuery, setSearchQueryRaw] = useState(searchParams.get('search') || '');
  const [filters, setFiltersState] = useState<Record<string, string>>(() => {
    // URL から filter[key]=value を復元
    const restored: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      const match = key.match(/^filter\[(.+)]$/);
      if (match && value) {
        restored[match[1]] = value;
      }
    });
    return restored;
  });

  // ソート状態: SortItem[] で管理
  const [sortItems, setSortItems] = useState<SortItem[]>(() => {
    // URL の sort パラメータを解析
    const sortParam = searchParams.get('sort');
    if (sortParam) {
      const parsed = sortParam.split(',').map((s) => {
        const [field, dir] = s.split(':');
        return {
          field: field.trim(),
          direction: (dir === 'asc' || dir === 'desc' ? dir : 'asc') as 'asc' | 'desc',
        };
      }).filter((item) => item.field);
      if (parsed.length > 0) return parsed;
    }
    // 後方互換: sortField / sortDirection
    const sortField = searchParams.get('sortField');
    if (sortField) {
      const dir = searchParams.get('sortDirection');
      return [{
        field: sortField,
        direction: (dir === 'asc' || dir === 'desc' ? dir : 'asc') as 'asc' | 'desc',
      }];
    }
    return defaultSortItems;
  });

  const debouncedSearch = useDebounce(searchQuery, config.search.debounceMs ?? 300);

  // State → URL 同期（useEffect で state 変更後に自動反映）
  const isInitialMount = useRef(true);
  useEffect(() => {
    // 初回マウント時は URL → State の読み込みなので同期をスキップ
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const params = new URLSearchParams();
    const sortStr = sortItems.map((s) => `${s.field}:${s.direction}`).join(',');
    const defaultSortStr = defaultSortItems.map((s) => `${s.field}:${s.direction}`).join(',');

    if (page > 1) params.set('page', String(page));
    if (pageSize !== defaultPageSize) params.set('pageSize', String(pageSize));
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (sortStr !== defaultSortStr) params.set('sort', sortStr);

    // フィルターを URL に追加
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(`filter[${key}]`, value);
    }

    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [page, pageSize, debouncedSearch, sortItems, defaultSortItems, filters, pathname, router, defaultPageSize]);

  // TanStack Query
  const queryKey = useMemo(
    () => [config.apiEndpoint, page, pageSize, debouncedSearch, sortItems, filters],
    [config.apiEndpoint, page, pageSize, debouncedSearch, sortItems, filters],
  );

  const { data: queryResult, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: () =>
      apiClient.getList(config.apiEndpoint, {
        page,
        pageSize,
        search: debouncedSearch,
        sort: sortItems,
        filters,
      }),
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });

  // インライン編集フックからキャッシュ更新できるよう公開
  const listQueryKey = queryKey;

  // ページ変更
  const handleSetPage = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  const handleSetPageSize = useCallback((newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  }, []);

  // 検索
  const handleSetSearchQuery = useCallback((query: string) => {
    setSearchQueryRaw(query);
    setPage(1);
  }, []);

  // フィルター（空値はキーごと削除して無駄なパラメータ送信を防ぐ）
  const handleSetFilter = useCallback((key: string, value: string) => {
    setFiltersState((prev) => {
      const next = { ...prev };
      if (!value) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
    setPage(1);
  }, []);

  const handleClearFilters = useCallback(() => {
    setFiltersState({});
    setPage(1);
  }, []);

  // ソート（単一列ソート）
  // 1. 未ソート列をクリック → その列で昇順ソート（他の列は解除）
  // 2. 昇順の列をクリック → 降順に切り替え
  // 3. 降順の列をクリック → デフォルトソートに戻す
  const handleSetSort = useCallback(
    (field: string) => {
      setSortItems((prev) => {
        const existing = prev.find((s) => s.field === field);

        if (!existing) {
          // 未ソート → この列単独で昇順ソート
          return [{ field, direction: 'asc' as const }];
        }

        if (existing.direction === 'asc') {
          // 昇順 → 降順
          return [{ field, direction: 'desc' as const }];
        }

        // 降順 → デフォルトソートに戻す
        return defaultSortItems;
      });
      setPage(1);
    },
    [defaultSortItems],
  );

  // ソートクリア
  const handleClearSort = useCallback(() => {
    setSortItems(defaultSortItems);
    setPage(1);
  }, [defaultSortItems]);

  // ソート一括置換（ビュー適用時に使用）
  const handleSetSortItems = useCallback(
    (items: SortItem[]) => {
      setSortItems(items.length > 0 ? items : defaultSortItems);
      setPage(1);
    },
    [defaultSortItems],
  );

  // フィルター一括置換（ビュー適用時に使用）
  const handleSetFilters = useCallback(
    (newFilters: Record<string, string>) => {
      setFiltersState(newFilters);
      setPage(1);
    },
    [],
  );

  return {
    data: queryResult?.data ?? [],
    loading: isLoading,
    error: error as Error | null,
    pagination: {
      currentPage: queryResult?.meta?.page ?? page,
      pageSize: queryResult?.meta?.pageSize ?? pageSize,
      total: queryResult?.meta?.total ?? 0,
      totalPages: queryResult?.meta?.totalPages ?? 1,
    },
    setPage: handleSetPage,
    setPageSize: handleSetPageSize,
    searchQuery,
    setSearchQuery: handleSetSearchQuery,
    filters,
    setFilter: handleSetFilter,
    clearFilters: handleClearFilters,
    sortItems,
    setSort: handleSetSort,
    setSortItems: handleSetSortItems,
    clearSort: handleClearSort,
    setFilters: handleSetFilters,
    refresh: refetch,
    queryKey: listQueryKey,
  };
}
