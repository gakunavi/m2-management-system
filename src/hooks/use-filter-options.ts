'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

type OptionItem = { value: string; label: string };

/**
 * filter-options エンドポイントから特定キーの選択肢を取得する。
 *
 * @param endpoint   - 例: '/customers/filter-options'
 * @param filterKey  - 取得したいキー（例: 'industryId'）
 */
export function useFilterOptions(
  endpoint: string | undefined,
  filterKey: string,
): { options: OptionItem[]; loading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ['filter-options', endpoint, filterKey],
    queryFn: async () => {
      if (!endpoint) return null;
      const result = await apiClient.get<Record<string, OptionItem[]>>(endpoint);
      return result;
    },
    enabled: !!endpoint,
    staleTime: 5 * 60 * 1000, // 5分キャッシュ
  });

  const options: OptionItem[] = data?.[filterKey] ?? [];

  return { options, loading: isLoading };
}
