'use client';

import { useCallback, useMemo } from 'react';
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

  // 自分のビューと共有ビューを分離
  const myViews = useMemo(
    () => views.filter((v) => !v.ownerName),
    [views],
  );
  const sharedViews = useMemo(
    () => views.filter((v) => !!v.ownerName),
    [views],
  );

  const createMutation = useMutation({
    mutationFn: (payload: {
      viewName: string;
      settings: SavedViewSettings;
      isDefault?: boolean;
      isShared?: boolean;
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
      isShared?: boolean;
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
    (viewName: string, settings: SavedViewSettings, isDefault = false, isShared = false) =>
      createMutation.mutateAsync({ viewName, settings, isDefault, isShared }),
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

  const toggleShareView = useCallback(
    (id: number, isShared: boolean) =>
      updateMutation.mutateAsync({ id, isShared }),
    [updateMutation],
  );

  const deleteView = useCallback(
    (id: number) => deleteMutation.mutateAsync(id),
    [deleteMutation],
  );

  /** 共有ビューを自分のビューとしてコピー */
  const copySharedView = useCallback(
    async (sourceView: SavedTableView) => {
      return createMutation.mutateAsync({
        viewName: `${sourceView.viewName}（コピー）`,
        settings: sourceView.settings as SavedViewSettings,
        isDefault: false,
        isShared: false,
      });
    },
    [createMutation],
  );

  const defaultView = myViews.find((v) => v.isDefault) ?? null;

  return {
    views,
    myViews,
    sharedViews,
    isLoading,
    defaultView,
    createView,
    renameView,
    updateViewSettings,
    setDefaultView,
    toggleShareView,
    copySharedView,
    deleteView,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
