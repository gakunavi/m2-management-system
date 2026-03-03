'use client';

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import type { SavedTableView, SavedViewSettings } from '@/types/config';

export function useSavedViews(tableKey: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ['saved-views', tableKey];

  const { data: views = [], isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      apiClient.get<SavedTableView[]>(
        `/saved-views?tableKey=${encodeURIComponent(tableKey)}`,
      ),
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: (payload: {
      viewName: string;
      settings: SavedViewSettings;
      isDefault?: boolean;
    }) =>
      apiClient.create<SavedTableView>('/saved-views', {
        tableKey,
        ...payload,
      }),
    onSuccess: (newView) => {
      queryClient.setQueryData(queryKey, (old: SavedTableView[] = []) => {
        // デフォルト設定時は既存のデフォルトを解除
        const updated = newView.isDefault
          ? old.map((v) => ({ ...v, isDefault: false }))
          : old;
        return [...updated, newView];
      });
      toast({ message: 'ビューを保存しました', type: 'success' });
    },
    onError: (error: Error) => {
      toast({ message: `ビューの保存に失敗しました: ${error.message}`, type: 'error' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      ...patch
    }: {
      id: number;
      viewName?: string;
      settings?: SavedViewSettings;
      displayOrder?: number;
      isDefault?: boolean;
    }) => apiClient.patch<SavedTableView>(`/saved-views/${id}`, patch),
    onSuccess: (updatedView) => {
      queryClient.setQueryData(queryKey, (old: SavedTableView[] = []) =>
        old.map((v) => {
          if (v.id === updatedView.id) return updatedView;
          // デフォルト設定時は他のデフォルトを解除
          if (updatedView.isDefault) return { ...v, isDefault: false };
          return v;
        }),
      );
    },
    onError: (error: Error) => {
      toast({ message: `ビューの更新に失敗しました: ${error.message}`, type: 'error' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.remove('/saved-views', id),
    onSuccess: (_result, id) => {
      queryClient.setQueryData(queryKey, (old: SavedTableView[] = []) =>
        old.filter((v) => v.id !== id),
      );
      toast({ message: 'ビューを削除しました', type: 'success' });
    },
    onError: (error: Error) => {
      toast({ message: `ビューの削除に失敗しました: ${error.message}`, type: 'error' });
    },
  });

  const createView = useCallback(
    (viewName: string, settings: SavedViewSettings, isDefault = false) =>
      createMutation.mutateAsync({ viewName, settings, isDefault }),
    [createMutation],
  );

  const renameView = useCallback(
    (id: number, viewName: string) =>
      updateMutation.mutateAsync({ id, viewName }),
    [updateMutation],
  );

  const updateViewSettings = useCallback(
    (id: number, settings: SavedViewSettings) =>
      updateMutation.mutateAsync({ id, settings }),
    [updateMutation],
  );

  const setDefaultView = useCallback(
    (id: number) => updateMutation.mutateAsync({ id, isDefault: true }),
    [updateMutation],
  );

  const deleteView = useCallback(
    (id: number) => deleteMutation.mutateAsync(id),
    [deleteMutation],
  );

  const defaultView = views.find((v) => v.isDefault) ?? null;

  return {
    views,
    isLoading,
    defaultView,
    createView,
    renameView,
    updateViewSettings,
    setDefaultView,
    deleteView,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
