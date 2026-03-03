'use client';

import { useQuery } from '@tanstack/react-query';
import type { EntityDetailConfig } from '@/types/config';

export function useEntityDetail(config: EntityDetailConfig, id: string) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [config.entityType, id],
    queryFn: async () => {
      const res = await fetch(`/api/v1${config.apiEndpoint(id)}`);
      if (!res.ok) throw new Error('データの取得に失敗しました');
      const json = await res.json() as { data: Record<string, unknown> };
      return json.data;
    },
    enabled: !!id,
    staleTime: 30 * 1000,
  });

  return {
    data: data ?? null,
    loading: isLoading,
    error: error as Error | null,
    refresh: refetch,
  };
}
