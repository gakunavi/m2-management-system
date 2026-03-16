import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';

interface BusinessData {
  id: number;
  version: number;
  businessConfig: {
    projectFields?: ProjectFieldDefinition[];
  } | null;
}

export function useProjectFieldDefinitions(businessId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ['business', businessId];

  const { data: businessData, isLoading } = useQuery({
    queryKey,
    queryFn: () => apiClient.get<BusinessData>(`/businesses/${businessId}`),
    enabled: !!businessId,
  });

  const projectFields: ProjectFieldDefinition[] =
    (businessData?.businessConfig?.projectFields ?? []).sort((a, b) => a.sortOrder - b.sortOrder);

  const saveFields = async (newFields: ProjectFieldDefinition[]) => {
    if (!businessData) return;
    try {
      await apiClient.patch(`/businesses/${businessId}`, {
        businessConfig: { projectFields: newFields },
        version: businessData.version,
      });
      // 同じ /businesses/{id} を参照する全クエリを無効化
      // useProjectConfig は ['business-config', id] を使うため predicate で両方対応
      queryClient.invalidateQueries({
        predicate: (query) => {
          const k = query.queryKey;
          return (
            (k[0] === 'business' && k[1] === businessId) ||
            (k[0] === 'business-config' && k[1] === businessId)
          );
        },
      });
      toast({ message: 'フィールド定義を保存しました', type: 'success' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : '保存に失敗しました';
      toast({ title: 'エラー', message: msg, type: 'error' });
      throw error;
    }
  };

  const create = async (formData: Record<string, unknown>) => {
    const fieldType = formData.type as ProjectFieldDefinition['type'];
    const newField: ProjectFieldDefinition = {
      key: formData.key as string,
      label: formData.label as string,
      type: fieldType,
      required: fieldType === 'formula' ? false : ((formData.required as boolean) ?? false),
      description: (formData.description as string) || undefined,
      options: fieldType === 'select' && formData.options
        ? Array.isArray(formData.options)
          ? formData.options.map(String).filter(Boolean)
          : (formData.options as string).split('\n').map((s) => s.trim()).filter(Boolean)
        : undefined,
      formula: fieldType === 'formula' && formData.formula
        ? (formData.formula as string).trim()
        : undefined,
      sortOrder: projectFields.length + 1,
      visibleToPartner: (formData.visibleToPartner as boolean) ?? false,
      filterable: (formData.filterable as boolean) ?? false,
    };

    // キーの重複チェック
    if (projectFields.some((f) => f.key === newField.key)) {
      toast({ title: 'エラー', message: 'このフィールドキーはすでに使用されています', type: 'error' });
      throw new Error('duplicate key');
    }

    await saveFields([...projectFields, newField]);
  };

  const update = async (id: string | number, formData: Record<string, unknown>) => {
    const updatedFields = projectFields.map((f) => {
      if (f.key === String(id)) {
        return {
          ...f,
          label: formData.label as string,
          required: f.type === 'formula' ? false : ((formData.required as boolean) ?? false),
          description: (formData.description as string) || undefined,
          options: f.type === 'select' && formData.options
            ? Array.isArray(formData.options)
              ? formData.options.map(String).filter(Boolean)
              : (formData.options as string).split('\n').map((s) => s.trim()).filter(Boolean)
            : f.options,
          formula: f.type === 'formula' && formData.formula
            ? (formData.formula as string).trim()
            : f.formula,
          visibleToPartner: (formData.visibleToPartner as boolean) ?? f.visibleToPartner,
          filterable: (formData.filterable as boolean) ?? f.filterable,
        };
      }
      return f;
    });
    await saveFields(updatedFields);
  };

  const remove = async (id: string | number) => {
    const updatedFields = projectFields.filter((f) => f.key !== String(id));
    await saveFields(updatedFields);
    toast({ message: 'フィールドを削除しました', type: 'success' });
  };

  const reorder = async (orderedIds: (string | number)[]) => {
    const idOrder = orderedIds.map(String);
    const reordered = idOrder
      .map((key, idx) => {
        const field = projectFields.find((f) => f.key === key);
        if (!field) return null;
        return { ...field, sortOrder: idx + 1 };
      })
      .filter((f): f is ProjectFieldDefinition => f !== null);
    await saveFields(reordered);
  };

  // フォームフィールド用: アイテムの id として key を使用する変換
  const itemsForList = projectFields.map((f) => ({ ...f, id: f.key }));

  return {
    items: itemsForList,
    projectFields,
    isLoading,
    create,
    update,
    remove,
    reorder,
  };
}
