import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import {
  projectListConfig,
  projectDetailConfig,
  projectFormConfig,
} from '@/config/entities/project';
import {
  buildFormFields,
  buildDynamicColumns,
  buildDynamicDisplayFields,
  buildDynamicCsvColumns,
} from '@/lib/dynamic-field-helpers';
import { buildDynamicFieldSchema } from '@/lib/validations/dynamic-fields';
import { projectBaseSchema } from '@/lib/validations/project';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';
import type { StatusDefinition } from '@/hooks/use-status-definitions';
import type { EntityListConfig, EntityDetailConfig, EntityFormConfig } from '@/types/config';

interface BusinessConfigData {
  id: number;
  businessName: string;
  businessProjectPrefix: string | null;
  businessConfig: {
    projectFields?: ProjectFieldDefinition[];
  } | null;
}

interface UseProjectConfigResult {
  listConfig: EntityListConfig;
  detailConfig: EntityDetailConfig;
  formConfig: EntityFormConfig;
  statusDefinitions: StatusDefinition[];
  isLoading: boolean;
}

export function useProjectConfig(businessId: number | null): UseProjectConfigResult {
  // 1. 事業の設定を取得
  const { data: businessData, isLoading: isLoadingBusiness } = useQuery({
    queryKey: ['business-config', businessId],
    queryFn: () => apiClient.get<BusinessConfigData>(`/businesses/${businessId}`),
    enabled: !!businessId,
  });

  // 2. 営業ステータス定義を取得
  const { data: statusDefs, isLoading: isLoadingStatus } = useQuery({
    queryKey: ['status-definitions', businessId],
    queryFn: () => apiClient.get<StatusDefinition[]>(`/businesses/${businessId}/status-definitions`),
    enabled: !!businessId,
  });

  // 3. フィールド定義を抽出
  const projectFields: ProjectFieldDefinition[] = useMemo(
    () => (businessData?.businessConfig?.projectFields ?? []).sort((a, b) => a.sortOrder - b.sortOrder),
    [businessData]
  );

  // 4. ステータス選択肢を構築
  const statusOptions = useMemo(
    () =>
      (statusDefs ?? []).map((s) => ({
        label: s.statusLabel,
        value: s.statusCode,
      })),
    [statusDefs]
  );

  // 5. 動的 listConfig
  const listConfig = useMemo<EntityListConfig>(() => {
    const dynamicColumns = buildDynamicColumns(projectFields);
    return {
      ...projectListConfig,
      columns: [
        ...projectListConfig.columns.map((col) => {
          if (col.key === 'projectSalesStatus') {
            return {
              ...col,
              edit: { type: 'select' as const, options: statusOptions },
            };
          }
          return col;
        }),
        ...dynamicColumns,
      ],
      filters: projectListConfig.filters.map((f) => {
        if (f.key === 'projectSalesStatus' && f.type === 'multi-select') {
          return { ...f, options: statusOptions } as typeof f;
        }
        return f;
      }),
      ...(projectListConfig.csv && {
        csv: {
          ...projectListConfig.csv,
          endpoint: businessId
            ? `${projectListConfig.csv.endpoint}?businessId=${businessId}`
            : projectListConfig.csv.endpoint,
          templateColumns: [
            ...(projectListConfig.csv.templateColumns ?? []),
            ...buildDynamicCsvColumns(projectFields),
          ],
          columnKeyMap: {
            ...(projectListConfig.csv.columnKeyMap ?? {}),
            ...Object.fromEntries(
              projectFields.map((f) => [`customData_${f.key}`, f.key])
            ),
          },
        },
      }),
    };
  }, [projectFields, statusOptions]);

  // 6. 動的 formConfig
  const formConfig = useMemo<EntityFormConfig>(() => {
    const dynamicFormFields = buildFormFields(projectFields);
    const dynamicSchema = projectFields.length
      ? projectBaseSchema.extend({
          customData: buildDynamicFieldSchema(projectFields).optional().default({}),
        })
      : projectBaseSchema;

    return {
      ...projectFormConfig,
      defaultValues: businessId ? { businessId } : undefined,
      sections: [
        {
          ...projectFormConfig.sections[0],
          fields: projectFormConfig.sections[0].fields.map((f) => {
            if (f.key === 'projectSalesStatus') {
              return { ...f, options: statusOptions };
            }
            return f;
          }),
        },
        ...(dynamicFormFields.length > 0
          ? [{
              title: '事業固有項目',
              columns: 2 as const,
              fields: dynamicFormFields,
            }]
          : []),
      ],
      validationSchema: dynamicSchema,
    };
  }, [projectFields, statusOptions, businessId]);

  // 7. 動的 detailConfig
  const detailConfig = useMemo<EntityDetailConfig>(() => {
    const dynamicDisplayFields = buildDynamicDisplayFields(projectFields);
    const infoTab = projectDetailConfig.tabs[0];

    return {
      ...projectDetailConfig,
      tabs: [
        {
          ...infoTab,
          config: {
            ...infoTab.config,
            sections: [
              ...(infoTab.config as { sections: unknown[] }).sections,
              ...(dynamicDisplayFields.length > 0
                ? [{
                    title: '事業固有情報',
                    columns: 2,
                    fields: dynamicDisplayFields,
                  }]
                : []),
            ],
          },
        },
        ...projectDetailConfig.tabs.slice(1),
      ],
    };
  }, [projectFields]);

  return {
    listConfig,
    detailConfig,
    formConfig,
    statusDefinitions: statusDefs ?? [],
    isLoading: isLoadingBusiness || isLoadingStatus,
  };
}
