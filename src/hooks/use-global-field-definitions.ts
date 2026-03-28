import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import type { EntityFieldDefinition } from '@/types/dynamic-fields';

type EntityType = 'customer' | 'partner';

interface GlobalFieldsData {
  customerFields: EntityFieldDefinition[];
  partnerFields: EntityFieldDefinition[];
}

const QUERY_KEY = ['global-custom-fields'];

/**
 * グローバル（グループ全体）カスタムフィールド定義の CRUD フック。
 * SystemSetting テーブルに保存される。
 */
export function useGlobalFieldDefinitions(entityType: EntityType) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiClient.get<GlobalFieldsData>('/system-settings/custom-fields'),
  });

  const fieldKey = entityType === 'customer' ? 'customerFields' : 'partnerFields';
  const fields: EntityFieldDefinition[] = (data?.[fieldKey] ?? []).sort((a, b) => a.sortOrder - b.sortOrder);

  const saveFields = async (newFields: EntityFieldDefinition[]) => {
    try {
      await apiClient.patch('/system-settings/custom-fields', {
        [fieldKey]: newFields,
      });
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
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
    };

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
