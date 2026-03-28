import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import {
  customerListConfig,
  customerDetailConfig,
  customerFormConfig,
} from '@/config/entities/customer';
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
    customerFields?: EntityFieldDefinition[];
  } | null;
}

interface GlobalFieldsData {
  customerFields: EntityFieldDefinition[];
  partnerFields: EntityFieldDefinition[];
}

interface UseCustomerConfigResult {
  listConfig: EntityListConfig;
  detailConfig: EntityDetailConfig;
  formConfig: EntityFormConfig;
  isLoading: boolean;
}

export function useCustomerConfig(businessId: number | null): UseCustomerConfigResult {
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

  // 事業別フィールド
  const customerFields: EntityFieldDefinition[] = useMemo(
    () => (businessData?.businessConfig?.customerFields ?? []).sort((a, b) => a.sortOrder - b.sortOrder),
    [businessData]
  );

  // グローバルフィールド
  const globalFields: EntityFieldDefinition[] = useMemo(
    () => (globalData?.customerFields ?? []).sort((a, b) => a.sortOrder - b.sortOrder),
    [globalData]
  );

  // 動的 listConfig
  const listConfig = useMemo<EntityListConfig>(() => {
    if (customerFields.length === 0 && globalFields.length === 0) return customerListConfig;

    const dynamicColumns = buildDynamicColumns(customerFields, {
      dataKey: 'linkCustomData',
      patchEndpoint: (row) => `/customers/${row.id}`,
      patchFieldPrefix: 'linkCustomData',
      columnGroup: '事業カスタム情報',
      columnKeyPrefix: 'customerLink',
      patchExtraBody: businessId ? { businessId } : undefined,
    });

    // グローバル列（businessId付きでPATCHレスポンスに事業別データも含める）
    const globalColumns = buildDynamicColumns(globalFields, {
      dataKey: 'customerCustomData',
      patchEndpoint: (row) => `/customers/${row.id}${businessId ? `?businessId=${businessId}` : ''}`,
      patchFieldPrefix: 'customerCustomData',
      columnGroup: 'グループ共通情報',
      columnKeyPrefix: 'customerGlobal',
    });

    const DYNAMIC_INSERT_BEFORE = 'updatedAt';
    const fixedColumns = [...customerListConfig.columns];
    const insertIndex = fixedColumns.findIndex((c) => c.key === DYNAMIC_INSERT_BEFORE);
    const spliceAt = insertIndex >= 0 ? insertIndex : fixedColumns.length;
    const mergedColumns = [
      ...fixedColumns.slice(0, spliceAt),
      ...globalColumns,
      ...dynamicColumns,
      ...fixedColumns.slice(spliceAt),
    ];

    return {
      ...customerListConfig,
      // 通常PATCHレスポンスにもカスタムデータを含めるため、patchEndpointにbusinessIdを付与
      ...(businessId ? { patchEndpoint: (id: number) => `/customers/${id}?businessId=${businessId}` } : {}),
      columns: mergedColumns,
      columnGroupOrder: ['基本情報', '担当者情報', '連絡先', '企業情報', 'その他', 'グループ共通情報', '事業カスタム情報', 'システム'],
      filters: [
        ...customerListConfig.filters,
        ...buildDynamicFilters(globalFields, 'customerGlobalField'),
        ...buildDynamicFilters(customerFields, 'customerLinkField'),
      ],
    };
  }, [customerFields, globalFields, businessId]);

  // 動的 formConfig
  const formConfig = useMemo<EntityFormConfig>(() => {
    if (customerFields.length === 0 && globalFields.length === 0) {
      return businessId
        ? { ...customerFormConfig, extraSubmitData: { businessId } }
        : customerFormConfig;
    }

    const globalFormFields = buildFormFields(globalFields, {
      dataKey: 'customerCustomData',
      patchEndpoint: null,
      patchFieldPrefix: 'customerCustomData',
    });

    // 事業別フィールドは事業選択時のみ表示（linkはBusinessLink経由で保存されるため）
    const dynamicFormFields = businessId
      ? buildFormFields(customerFields, {
          dataKey: 'linkCustomData',
          patchEndpoint: null,
          patchFieldPrefix: 'linkCustomData',
        })
      : [];

    return {
      ...customerFormConfig,
      ...(businessId ? { extraSubmitData: { businessId } } : {}),
      sections: [
        ...customerFormConfig.sections,
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
  }, [customerFields, globalFields, businessId]);

  // 動的 detailConfig
  const detailConfig = useMemo<EntityDetailConfig>(() => {
    if (customerFields.length === 0 && globalFields.length === 0) return customerDetailConfig;

    const globalDisplayFields = buildDynamicDisplayFields(globalFields, {
      dataKey: 'customerCustomData',
      patchEndpoint: null,
      patchFieldPrefix: 'customerCustomData',
    });

    const dynamicDisplayFields = buildDynamicDisplayFields(customerFields, {
      dataKey: 'linkCustomData',
      patchEndpoint: null,
      patchFieldPrefix: 'linkCustomData',
    });
    const infoTab = customerDetailConfig.tabs[0];

    return {
      ...customerDetailConfig,
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
        ...customerDetailConfig.tabs.slice(1),
      ],
    };
  }, [customerFields, globalFields]);

  return {
    listConfig,
    detailConfig,
    formConfig,
    isLoading,
  };
}
