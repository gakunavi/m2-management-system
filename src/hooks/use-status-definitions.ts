import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

export interface StatusDefinition {
  id: number;
  businessId: number;
  statusCode: string;
  statusLabel: string;
  statusPriority: number;
  statusColor: string | null;
  statusIsFinal: boolean;
  statusIsLost: boolean;
  statusSortOrder: number;
  statusIsActive: boolean;
}

export function useStatusDefinitions(businessId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ['status-definitions', businessId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => apiClient.get<StatusDefinition[]>(`/businesses/${businessId}/status-definitions`),
    enabled: !!businessId,
  });

  const create = async (formData: Record<string, unknown>) => {
    try {
      await apiClient.create(`/businesses/${businessId}/status-definitions`, formData);
      queryClient.invalidateQueries({ queryKey });
      toast({ message: 'ステータスを追加しました', type: 'success' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : '追加に失敗しました';
      toast({ title: 'エラー', message: msg, type: 'error' });
      throw error;
    }
  };

  const update = async (id: string | number, formData: Record<string, unknown>) => {
    try {
      await apiClient.patch(`/businesses/${businessId}/status-definitions/${id}`, formData);
      queryClient.invalidateQueries({ queryKey });
      toast({ message: 'ステータスを更新しました', type: 'success' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : '更新に失敗しました';
      toast({ title: 'エラー', message: msg, type: 'error' });
      throw error;
    }
  };

  const remove = async (id: string | number) => {
    try {
      await apiClient.remove(`/businesses/${businessId}/status-definitions`, id);
      queryClient.invalidateQueries({ queryKey });
      toast({ message: 'ステータスを削除しました', type: 'success' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : '削除に失敗しました';
      toast({ title: 'エラー', message: msg, type: 'error' });
      throw error;
    }
  };

  const reorder = async (orderedIds: (string | number)[]) => {
    try {
      await apiClient.patch(`/businesses/${businessId}/status-definitions/reorder`, { orderedIds });
      queryClient.invalidateQueries({ queryKey });
    } catch (error) {
      const msg = error instanceof Error ? error.message : '並び替えに失敗しました';
      toast({ title: 'エラー', message: msg, type: 'error' });
      throw error;
    }
  };

  return {
    items: data ?? [],
    isLoading,
    create,
    update,
    remove,
    reorder,
  };
}
