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
  buildDynamicFilters,
} from '@/lib/dynamic-field-helpers';
import { buildDynamicFieldSchema } from '@/lib/validations/dynamic-fields';
import { buildDefaultStatusCodes } from '@/lib/status-defaults';
import { projectBaseSchema } from '@/lib/validations/project';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';
import type { StatusDefinition } from '@/hooks/use-status-definitions';
import type { EntityListConfig, EntityDetailConfig, EntityFormConfig } from '@/types/config';

interface BusinessConfigData {
  id: number;
  businessName: string;
  businessConfig: {
    projectFields?: ProjectFieldDefinition[];
    customerFields?: ProjectFieldDefinition[];
    partnerFields?: ProjectFieldDefinition[];
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

  // 3b. 顧客/代理店フィールドで showOnProject=true のものを抽出
  const customerShowFields: ProjectFieldDefinition[] = useMemo(
    () => (businessData?.businessConfig?.customerFields ?? []).filter((f) => f.showOnProject).sort((a, b) => a.sortOrder - b.sortOrder),
    [businessData]
  );
  const partnerShowFields: ProjectFieldDefinition[] = useMemo(
    () => (businessData?.businessConfig?.partnerFields ?? []).filter((f) => f.showOnProject).sort((a, b) => a.sortOrder - b.sortOrder),
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

  // 4b. 初期表示の営業ステータス（失注のみ除外）
  // 契約マスタは受注済みの契約も台帳として見続けるため、最終ステータスは除外しない。
  const defaultStatusCodes = useMemo(
    () => buildDefaultStatusCodes(statusDefs ?? [], { excludeInactive: false }),
    [statusDefs],
  );
  /** 収益確定フラグが立っているステータスコード（コピー時の警告に使う） */
  const revenueConfirmedStatusCodes = useMemo(
    () => new Set((statusDefs ?? []).filter((s) => s.isRevenueConfirmed).map((s) => s.statusCode)),
    [statusDefs],
  );

  /** 失注ステータスが1つも無い事業では既定の絞り込みを入れない */
  const hasLostStatus = useMemo(
    () => (statusDefs ?? []).some((s) => s.statusIsLost),
    [statusDefs],
  );

  // 5. 動的 listConfig
  const listConfig = useMemo<EntityListConfig>(() => {
    const dynamicColumns = buildDynamicColumns(projectFields, {
      columnGroup: '契約マスタ情報',
    });

    // 顧客/代理店の showOnProject フィールド（インライン編集可）
    const customerShowColumns = buildDynamicColumns(customerShowFields, {
      dataKey: 'customerLinkCustomData',
      patchEndpoint: (row) => {
        const c = row.customer as { id?: number } | null;
        return c?.id ? `/customers/${c.id}` : '';
      },
      patchFieldPrefix: 'linkCustomData',
      columnGroup: '顧客マスタ情報',
      columnKeyPrefix: 'customerLink',
      patchExtraBody: (row) => ({
        businessId: row.businessId as number,
        version: row.customerVersion as number,
      }),
    });
    const partnerShowColumns = buildDynamicColumns(partnerShowFields, {
      dataKey: 'partnerLinkCustomData',
      patchEndpoint: (row) => {
        const p = row.partner as { id?: number } | null;
        return p?.id ? `/partners/${p.id}` : '';
      },
      patchFieldPrefix: 'linkCustomData',
      columnGroup: '代理店マスタ情報',
      columnKeyPrefix: 'partnerLink',
      patchExtraBody: (row) => ({
        businessId: row.businessId as number,
        version: row.partnerVersion as number,
      }),
    });

    // 固定列の後、システム列（updatedAt/createdAt）の前にカスタムフィールドを挿入する
    // 列順: 主要固定 → 参照用固定 → 案件カスタム → 顧客カスタム → 代理店カスタム → システム固定
    const DYNAMIC_INSERT_BEFORE = 'updatedAt';
    const fixedColumns = projectListConfig.columns.map((col) => {
      if (col.key === 'projectSalesStatus') {
        return { ...col, edit: { type: 'select' as const, options: statusOptions } };
      }
      return col;
    });
    const insertIndex = fixedColumns.findIndex((c) => c.key === DYNAMIC_INSERT_BEFORE);
    const spliceAt = insertIndex >= 0 ? insertIndex : fixedColumns.length;
    const mergedColumns = [
      ...fixedColumns.slice(0, spliceAt),
      ...dynamicColumns,
      ...customerShowColumns,
      ...partnerShowColumns,
      ...fixedColumns.slice(spliceAt),
    ];

    return {
      ...projectListConfig,
      columns: mergedColumns,
      columnGroupOrder: ['契約マスタ情報', '顧客マスタ情報', '代理店マスタ情報', 'システム情報'],
      // 初回表示は失注を除いた状態で開く。定義が未取得／失注定義なし／
      // 全件失注のときは絞り込みを入れない（該当0件や無意味な長いURLを避ける）
      ...(hasLostStatus && defaultStatusCodes.length > 0
        ? { defaultFilters: { projectSalesStatus: defaultStatusCodes.join(',') } }
        : {}),
      filters: [
        ...projectListConfig.filters.map((f) => {
          if (f.key === 'projectSalesStatus' && f.type === 'multi-select') {
            return { ...f, options: statusOptions } as typeof f;
          }
          return f;
        }),
        ...buildDynamicFilters(projectFields),
      ],
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
            ...Object.fromEntries(
              customerShowFields.map((f) => [`customerLink_${f.key}`, `customerLink_${f.key}`])
            ),
            ...Object.fromEntries(
              partnerShowFields.map((f) => [`partnerLink_${f.key}`, `partnerLink_${f.key}`])
            ),
          },
        },
      }),
    };
  }, [projectFields, customerShowFields, partnerShowFields, statusOptions, businessId, defaultStatusCodes, hasLostStatus]);

  // 6. 動的 formConfig
  const formConfig = useMemo<EntityFormConfig>(() => {
    const dynamicFormFields = buildFormFields(projectFields);
    const dynamicSchema = projectFields.length
      ? projectBaseSchema.extend({
          projectCustomData: buildDynamicFieldSchema(projectFields).optional().default({}),
        })
      : projectBaseSchema;

    return {
      ...projectFormConfig,
      defaultValues: { ...projectFormConfig.defaultValues, ...(businessId ? { businessId } : {}) },
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
    const customerDisplayFields = buildDynamicDisplayFields(customerShowFields, {
      dataKey: 'customerLinkCustomData',
      patchEndpoint: null,
      patchFieldPrefix: 'customerLinkCustomData',
    });
    const partnerDisplayFields = buildDynamicDisplayFields(partnerShowFields, {
      dataKey: 'partnerLinkCustomData',
      patchEndpoint: null,
      patchFieldPrefix: 'partnerLinkCustomData',
    });
    const infoTab = projectDetailConfig.tabs[0];

    return {
      ...projectDetailConfig,
      actions: {
        ...projectDetailConfig.actions,
        ...(projectDetailConfig.actions.copy
          ? {
              copy: {
                ...projectDetailConfig.actions.copy,
                // 収益確定ステータスのままコピーすると、コピー先も即座に確定扱いになり
                // 当月の売上として計上される。気づかず二重計上するのを避けるため警告する
                confirmDescription: (data: Record<string, unknown>) => {
                  const base =
                    '営業ステータスもそのままコピーされます。案件番号は新しく採番され、ムーブメントの進捗・ファイル・コメント・リマインダーはコピーされません。';
                  return revenueConfirmedStatusCodes.has(String(data.projectSalesStatus))
                    ? `${base}\n\n⚠ このステータスは収益確定の対象です。コピーした案件もそのまま収益確定（今月計上）になります。`
                    : base;
                },
              },
            }
          : {}),
      },
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
              ...(customerDisplayFields.length > 0
                ? [{
                    title: '顧客カスタム情報',
                    columns: 2,
                    fields: customerDisplayFields,
                  }]
                : []),
              ...(partnerDisplayFields.length > 0
                ? [{
                    title: '代理店カスタム情報',
                    columns: 2,
                    fields: partnerDisplayFields,
                  }]
                : []),
            ],
          },
        },
        ...projectDetailConfig.tabs.slice(1),
      ],
    };
  }, [projectFields, customerShowFields, partnerShowFields, revenueConfirmedStatusCodes]);

  return {
    listConfig,
    detailConfig,
    formConfig,
    statusDefinitions: statusDefs ?? [],
    isLoading: isLoadingBusiness || isLoadingStatus,
  };
}
