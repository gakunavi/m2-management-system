'use client';

import { useQuery } from '@tanstack/react-query';
import type { MasterSelectConfig } from '@/types/config';

export type MasterOption = {
  value: string;  // ID の文字列表現
  label: string;  // 表示名
  id: number;
};

export function useMasterOptions(config: MasterSelectConfig) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['master-options', config.endpoint],
    queryFn: async () => {
      const res = await fetch(`/api/v1${config.endpoint}?includeInactive=false`);
      if (!res.ok) throw new Error('マスタデータの取得に失敗しました');
      const json = await res.json() as { data: Record<string, unknown>[] };
      return json.data.map((item): MasterOption => ({
        id: item['id'] as number,
        value: String(item['id']),
        label: item[config.labelField] as string,
      }));
    },
  });

  return {
    options: data ?? [],
    isLoading,
    refetch,
  };
}
