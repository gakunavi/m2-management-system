import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import type { EntityFieldDefinition } from '@/types/dynamic-fields';

type ConfigKey = 'projectFields' | 'customerFields' | 'partnerFields';

interface BusinessData {
  id: number;
  version: number;
  businessConfig: Record<string, EntityFieldDefinition[] | undefined> | null;
}

/**
 * 事業の businessConfig 内の任意のフィールド定義配列を CRUD 操作するフック。
 * configKey で対象を切り替える:
 *   - 'projectFields'  → 契約マスタ用（既存）
 *   - 'customerFields' → 顧客用
 *   - 'partnerFields'  → 代理店用
 */
export function useEntityFieldDefinitions(businessId: number, configKey: ConfigKey) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ['business', businessId];

  const { data: businessData, isLoading } = useQuery({
    queryKey,
    queryFn: () => apiClient.get<BusinessData>(`/businesses/${businessId}`),
    enabled: !!businessId,
  });

  const fields: EntityFieldDefinition[] =
    (businessData?.businessConfig?.[configKey] ?? []).sort((a, b) => a.sortOrder - b.sortOrder);

  const saveFields = async (newFields: EntityFieldDefinition[]) => {
    if (!businessData) return;
    try {
      await apiClient.patch(`/businesses/${businessId}`, {
        businessConfig: { [configKey]: newFields },
        version: businessData.version,
      });
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
    const fieldType = formData.type as EntityFieldDefinition['type'];
    const newField: EntityFieldDefinition = {
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
      sortOrder: fields.length + 1,
      visibleToPartner: (formData.visibleToPartner as boolean) ?? false,
      filterable: (formData.filterable as boolean) ?? false,
      showOnProject: (formData.showOnProject as boolean) ?? false,
    };

    if (!newField.key || !newField.key.trim()) {
      toast({ title: 'エラー', message: 'フィールドコードは必須です', type: 'error' });
      throw new Error('empty key');
    }
    if (!newField.label || !newField.label.trim()) {
      toast({ title: 'エラー', message: '表示ラベルは必須です', type: 'error' });
      throw new Error('empty label');
    }
    if (fields.some((f) => f.key === newField.key)) {
      toast({ title: 'エラー', message: 'このフィールドキーはすでに使用されています', type: 'error' });
      throw new Error('duplicate key');
    }

    await saveFields([...fields, newField]);
  };

  const update = async (id: string | number, formData: Record<string, unknown>) => {
    const updatedFields = fields.map((f) => {
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
          showOnProject: (formData.showOnProject as boolean) ?? f.showOnProject,
        };
      }
      return f;
    });
    await saveFields(updatedFields);
  };

  const remove = async (id: string | number) => {
    const updatedFields = fields.filter((f) => f.key !== String(id));
    await saveFields(updatedFields);
    toast({ message: 'フィールドを削除しました', type: 'success' });
  };

  const reorder = async (orderedIds: (string | number)[]) => {
    const idOrder = orderedIds.map(String);
    const reordered = idOrder
      .map((key, idx) => {
        const field = fields.find((f) => f.key === key);
        if (!field) return null;
        return { ...field, sortOrder: idx + 1 };
      })
      .filter((f): f is EntityFieldDefinition => f !== null);
    await saveFields(reordered);
  };

  const itemsForList = fields.map((f) => ({ ...f, id: f.key }));

  return {
    items: itemsForList,
    fields,
    isLoading,
    create,
    update,
    remove,
    reorder,
  };
}
