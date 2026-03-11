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

interface SyncResult {
  created: number;
  deleted: number;
}

export function useMovementTemplates(businessId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ['movement-templates', businessId];

  /** テンプレート変更後にムーブメント関連キャッシュも無効化 */
  const invalidateMovementCaches = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0] as string;
        return (
          key === 'project-movements' ||                // 案件詳細ムーブメントタブ
          key === 'project-movements-overview' ||        // 管理画面ムーブメント一覧
          key === 'portal-movements-overview'            // ポータルムーブメント一覧
        );
      },
    });
  };

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => apiClient.get<MovementTemplate[]>(`/businesses/${businessId}/movement-templates`),
    enabled: !!businessId,
  });

  const create = async (formData: Record<string, unknown>) => {
    try {
      await apiClient.create(`/businesses/${businessId}/movement-templates`, formData);
      invalidateMovementCaches();
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
      invalidateMovementCaches();
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
      invalidateMovementCaches();
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

  const sync = async (): Promise<SyncResult> => {
    try {
      const result = await apiClient.create<SyncResult>(
        `/businesses/${businessId}/movement-templates/sync`,
        {},
      );
      invalidateMovementCaches();
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : '同期に失敗しました';
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
    sync,
  };
}
