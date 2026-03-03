import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import type { FileCategory } from '@/types/project-file';

interface FileCategoryItem extends FileCategory {
  id: string;
}

interface BusinessData {
  id: number;
  version: number;
  businessConfig: Record<string, unknown> | null;
}

export function useFileCategories(businessId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ['business', businessId];

  const { data: business, isLoading } = useQuery({
    queryKey,
    queryFn: () => apiClient.get<BusinessData>(`/businesses/${businessId}`),
    enabled: !!businessId,
  });

  const config = (business?.businessConfig ?? {}) as Record<string, unknown>;
  const rawCategories = Array.isArray(config.fileCategories) ? config.fileCategories : [];
  const items: FileCategoryItem[] = rawCategories.map((c: unknown) => {
    const cat = c as FileCategory;
    return { ...cat, id: cat.key };
  });

  const saveCategories = async (categories: FileCategory[]) => {
    await apiClient.patch(`/businesses/${businessId}`, {
      version: business?.version,
      businessConfig: { fileCategories: categories },
    });
    queryClient.invalidateQueries({ queryKey });
  };

  const create = async (formData: Record<string, unknown>) => {
    try {
      const newCat: FileCategory = {
        key: String(formData.key ?? ''),
        label: String(formData.label ?? ''),
        sortOrder: items.length,
      };
      // 重複チェック
      if (items.some((i) => i.key === newCat.key)) {
        toast({ title: 'エラー', message: 'このキーは既に使用されています', type: 'error' });
        throw new Error('キーが重複しています');
      }
      const updated = [...rawCategories.map((c: unknown) => {
        const cat = c as FileCategory;
        return { key: cat.key, label: cat.label, sortOrder: cat.sortOrder };
      }), newCat];
      await saveCategories(updated);
      toast({ message: 'カテゴリを追加しました', type: 'success' });
    } catch (error) {
      if (error instanceof Error && error.message === 'キーが重複しています') throw error;
      const msg = error instanceof Error ? error.message : '追加に失敗しました';
      toast({ title: 'エラー', message: msg, type: 'error' });
      throw error;
    }
  };

  const update = async (id: string | number, formData: Record<string, unknown>) => {
    try {
      const updated = rawCategories.map((c: unknown) => {
        const cat = c as FileCategory;
        if (cat.key === String(id)) {
          return { key: cat.key, label: String(formData.label ?? cat.label), sortOrder: cat.sortOrder };
        }
        return { key: cat.key, label: cat.label, sortOrder: cat.sortOrder };
      });
      await saveCategories(updated);
      toast({ message: 'カテゴリを更新しました', type: 'success' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : '更新に失敗しました';
      toast({ title: 'エラー', message: msg, type: 'error' });
      throw error;
    }
  };

  const remove = async (id: string | number) => {
    try {
      const updated = rawCategories
        .filter((c: unknown) => (c as FileCategory).key !== String(id))
        .map((c: unknown, i: number) => {
          const cat = c as FileCategory;
          return { key: cat.key, label: cat.label, sortOrder: i };
        });
      await saveCategories(updated);
      toast({ message: 'カテゴリを削除しました', type: 'success' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : '削除に失敗しました';
      toast({ title: 'エラー', message: msg, type: 'error' });
      throw error;
    }
  };

  const reorder = async (orderedIds: (string | number)[]) => {
    try {
      const reordered = orderedIds.map((id, i) => {
        const cat = rawCategories.find((c: unknown) => (c as FileCategory).key === String(id)) as FileCategory;
        return { key: cat.key, label: cat.label, sortOrder: i };
      });
      await saveCategories(reordered);
    } catch (error) {
      const msg = error instanceof Error ? error.message : '並び替えに失敗しました';
      toast({ title: 'エラー', message: msg, type: 'error' });
      throw error;
    }
  };

  return {
    items,
    isLoading,
    create,
    update,
    remove,
    reorder,
  };
}
