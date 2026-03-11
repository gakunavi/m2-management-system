'use client';

import { useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { PersistedColumnSettings } from '@/types/config';

interface UserTablePreferenceData {
  id: number;
  userId: number;
  tableKey: string;
  settings: PersistedColumnSettings;
  updatedAt: string;
}

export function useTablePreferences(tableKey: string) {
  const queryClient = useQueryClient();
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: pref, isLoading } = useQuery({
    queryKey: ['table-preferences', tableKey],
    queryFn: () =>
      apiClient.get<UserTablePreferenceData | null>(
        `/user-preferences/table?tableKey=${encodeURIComponent(tableKey)}`,
      ),
    staleTime: 5 * 60 * 1000, // 5分間キャッシュ
  });

  const saveMutation = useMutation({
    mutationFn: (settings: PersistedColumnSettings) =>
      apiClient.put<UserTablePreferenceData>('/user-preferences/table', {
        tableKey,
        settings,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['table-preferences', tableKey], data);
    },
  });

  // unmount 時にデバウンスタイマーをクリーンアップ
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const savePreferences = useCallback(
    (settings: PersistedColumnSettings) => {
      // 楽観的キャッシュ更新（デバウンスを待たず即時反映）
      queryClient.setQueryData(
        ['table-preferences', tableKey],
        (old: UserTablePreferenceData | null | undefined) => {
          if (!old) {
            return {
              id: 0,
              userId: 0,
              tableKey,
              settings,
              updatedAt: new Date().toISOString(),
            } satisfies UserTablePreferenceData;
          }
          return { ...old, settings };
        },
      );

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        saveMutation.mutate(settings);
      }, 1000);
    },
    [saveMutation, queryClient, tableKey],
  );

  return {
    preferences: pref?.settings ?? null,
    isLoading,
    savePreferences,
  };
}
