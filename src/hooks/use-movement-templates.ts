import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

export interface MovementTemplate {
  id: number;
  businessId: number;
  stepNumber: number;
  stepCode: string;
  stepName: string;
  stepDescription: string | null;
  stepIsSalesLinked: boolean;
  stepLinkedStatusCode: string | null;
  stepIsActive: boolean;
  visibleToPartner: boolean;
}

export function useMovementTemplates(businessId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ['movement-templates', businessId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => apiClient.get<MovementTemplate[]>(`/businesses/${businessId}/movement-templates`),
    enabled: !!businessId,
  });

  const create = async (formData: Record<string, unknown>) => {
    try {
      await apiClient.create(`/businesses/${businessId}/movement-templates`, formData);
      queryClient.invalidateQueries({ queryKey });
      toast({ message: 'テンプレートを追加しました', type: 'success' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : '追加に失敗しました';
      toast({ title: 'エラー', message: msg, type: 'error' });
      throw error;
    }
  };

  const update = async (id: string | number, formData: Record<string, unknown>) => {
    try {
      await apiClient.patch(`/businesses/${businessId}/movement-templates/${id}`, formData);
      queryClient.invalidateQueries({ queryKey });
      toast({ message: 'テンプレートを更新しました', type: 'success' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : '更新に失敗しました';
      toast({ title: 'エラー', message: msg, type: 'error' });
      throw error;
    }
  };

  const remove = async (id: string | number) => {
    try {
      await apiClient.remove(`/businesses/${businessId}/movement-templates`, id);
      queryClient.invalidateQueries({ queryKey });
      toast({ message: 'テンプレートを削除しました', type: 'success' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : '削除に失敗しました';
      toast({ title: 'エラー', message: msg, type: 'error' });
      throw error;
    }
  };

  const reorder = async (orderedIds: (string | number)[]) => {
    try {
      await apiClient.patch(`/businesses/${businessId}/movement-templates/reorder`, { orderedIds });
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
