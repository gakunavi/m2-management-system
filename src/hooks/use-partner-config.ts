import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import {
  partnerListConfig,
  partnerDetailConfig,
  partnerFormConfig,
} from '@/config/entities/partner';
import {
  buildFormFields,
  buildDynamicColumns,
  buildDynamicDisplayFields,
  buildDynamicFilters,
} from '@/lib/dynamic-field-helpers';
import type { EntityFieldDefinition } from '@/types/dynamic-fields';
import type { EntityListConfig, EntityDetailConfig, EntityFormConfig } from '@/types/config';

interface BusinessConfigData {
  id: number;
  businessName: string;
  businessConfig: {
    partnerFields?: EntityFieldDefinition[];
  } | null;
}

interface GlobalFieldsData {
  customerFields: EntityFieldDefinition[];
  partnerFields: EntityFieldDefinition[];
}

interface UsePartnerConfigResult {
  listConfig: EntityListConfig;
  detailConfig: EntityDetailConfig;
  formConfig: EntityFormConfig;
  isLoading: boolean;
}

export function usePartnerConfig(businessId: number | null): UsePartnerConfigResult {
  const { data: businessData, isLoading: isLoadingBiz } = useQuery({
    queryKey: ['business-config', businessId],
    queryFn: () => apiClient.get<BusinessConfigData>(`/businesses/${businessId}`),
    enabled: !!businessId,
  });

  const { data: globalData, isLoading: isLoadingGlobal } = useQuery({
    queryKey: ['global-custom-fields'],
    queryFn: () => apiClient.get<GlobalFieldsData>('/system-settings/custom-fields'),
  });

  const isLoading = isLoadingBiz || isLoadingGlobal;

  const partnerFields: EntityFieldDefinition[] = useMemo(
    () => (businessData?.businessConfig?.partnerFields ?? []).sort((a, b) => a.sortOrder - b.sortOrder),
    [businessData]
  );

  const globalFields: EntityFieldDefinition[] = useMemo(
    () => (globalData?.partnerFields ?? []).sort((a, b) => a.sortOrder - b.sortOrder),
    [globalData]
  );

  // 動的 listConfig
  const listConfig = useMemo<EntityListConfig>(() => {
    if (partnerFields.length === 0 && globalFields.length === 0) return partnerListConfig;

    const dynamicColumns = buildDynamicColumns(partnerFields, {
      dataKey: 'linkCustomData',
      patchEndpoint: (row) => `/partners/${row.id}`,
      patchFieldPrefix: 'linkCustomData',
      columnGroup: '事業カスタム情報',
      columnKeyPrefix: 'partnerLink',
      patchExtraBody: businessId ? { businessId } : undefined,
    });

    const globalColumns = buildDynamicColumns(globalFields, {
      dataKey: 'partnerCustomData',
      patchEndpoint: (row) => `/partners/${row.id}`,
      patchFieldPrefix: 'partnerCustomData',
      columnGroup: 'グループ共通情報',
      columnKeyPrefix: 'partnerGlobal',
    });

    const DYNAMIC_INSERT_BEFORE = 'updatedAt';
    const fixedColumns = [...partnerListConfig.columns];
    const insertIndex = fixedColumns.findIndex((c) => c.key === DYNAMIC_INSERT_BEFORE);
    const spliceAt = insertIndex >= 0 ? insertIndex : fixedColumns.length;
    const mergedColumns = [
      ...fixedColumns.slice(0, spliceAt),
      ...globalColumns,
      ...dynamicColumns,
      ...fixedColumns.slice(spliceAt),
    ];

    return {
      ...partnerListConfig,
      columns: mergedColumns,
      columnGroupOrder: ['基本情報', '担当者情報', '連絡先', '企業情報', 'その他', 'グループ共通情報', '事業カスタム情報', 'システム'],
      filters: [
        ...partnerListConfig.filters,
        ...buildDynamicFilters(globalFields, 'partnerGlobalField'),
        ...buildDynamicFilters(partnerFields, 'partnerLinkField'),
      ],
    };
  }, [partnerFields, globalFields, businessId]);

  // 動的 formConfig
  const formConfig = useMemo<EntityFormConfig>(() => {
    if (partnerFields.length === 0 && globalFields.length === 0) {
      return businessId
        ? { ...partnerFormConfig, extraSubmitData: { businessId } }
        : partnerFormConfig;
    }

    const globalFormFields = buildFormFields(globalFields, {
      dataKey: 'partnerCustomData',
      patchEndpoint: null,
      patchFieldPrefix: 'partnerCustomData',
    });

    // 事業別フィールドは事業選択時のみ表示（linkはBusinessLink経由で保存されるため）
    const dynamicFormFields = businessId
      ? buildFormFields(partnerFields, {
          dataKey: 'linkCustomData',
          patchEndpoint: null,
          patchFieldPrefix: 'linkCustomData',
        })
      : [];

    return {
      ...partnerFormConfig,
      ...(businessId ? { extraSubmitData: { businessId } } : {}),
      sections: [
        ...partnerFormConfig.sections,
        ...(globalFormFields.length > 0
          ? [{
              title: 'グループ共通情報',
              columns: 2 as const,
              fields: globalFormFields,
            }]
          : []),
        ...(dynamicFormFields.length > 0
          ? [{
              title: '事業カスタム情報',
              columns: 2 as const,
              fields: dynamicFormFields,
            }]
          : []),
      ],
    };
  }, [partnerFields, globalFields, businessId]);

  // 動的 detailConfig
  const detailConfig = useMemo<EntityDetailConfig>(() => {
    if (partnerFields.length === 0 && globalFields.length === 0) return partnerDetailConfig;

    const globalDisplayFields = buildDynamicDisplayFields(globalFields, {
      dataKey: 'partnerCustomData',
      patchEndpoint: null,
      patchFieldPrefix: 'partnerCustomData',
    });

    const dynamicDisplayFields = buildDynamicDisplayFields(partnerFields, {
      dataKey: 'linkCustomData',
      patchEndpoint: null,
      patchFieldPrefix: 'linkCustomData',
    });
    const infoTab = partnerDetailConfig.tabs[0];

    return {
      ...partnerDetailConfig,
      tabs: [
        {
          ...infoTab,
          config: {
            ...infoTab.config,
            sections: [
              ...(infoTab.config as { sections: unknown[] }).sections,
              ...(globalDisplayFields.length > 0
                ? [{
                    title: 'グループ共通情報',
                    columns: 2,
                    fields: globalDisplayFields,
                  }]
                : []),
              ...(dynamicDisplayFields.length > 0
                ? [{
                    title: '事業カスタム情報',
                    columns: 2,
                    fields: dynamicDisplayFields,
                  }]
                : []),
            ],
          },
        },
        ...partnerDetailConfig.tabs.slice(1),
      ],
    };
  }, [partnerFields, globalFields]);

  return {
    listConfig,
    detailConfig,
    formConfig,
    isLoading,
  };
}
