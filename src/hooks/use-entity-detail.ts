'use client';

import { useQuery } from '@tanstack/react-query';
import type { EntityDetailConfig } from '@/types/config';

export function useEntityDetail(config: EntityDetailConfig, id: string) {
  const businessId = config.businessId;

  const { data, isLoading, error, refetch } = useQuery({
    // businessId を含めないと、事業を切り替えたときに前の事業のカスタムデータが残る
    queryKey: [config.entityType, id, businessId ?? null],
    queryFn: async () => {
      // businessId を付けないと API は linkCustomData を空で返す（事業カスタム情報が全て空欄になる）
      const qs = businessId != null ? `?businessId=${businessId}` : '';
      const res = await fetch(`/api/v1${config.apiEndpoint(id)}${qs}`);
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
