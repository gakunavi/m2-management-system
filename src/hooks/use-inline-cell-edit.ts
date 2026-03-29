'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { useToast } from './use-toast';
import type { EntityListConfig, CustomPatchConfig } from '@/types/config';

interface UpdateCellParams {
  rowId: number;
  field: string;
  value: unknown;
  version: number;
  queryKey: unknown[];
  /** 通常の patchEndpoint ではなく別 API に PATCH する設定 */
  customPatch?: CustomPatchConfig;
  /** customPatch 時に endpoint 生成に使う行データ */
  row?: Record<string, unknown>;
}

export function useInlineCellEdit(config: EntityListConfig) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const updateCell = useCallback(
    async ({ rowId, field, value, version, queryKey, customPatch, row }: UpdateCellParams): Promise<void> => {
      // 楽観的更新: キャッシュ内の該当行を即座に書き換え
      const previousData = queryClient.getQueryData(queryKey);

      queryClient.setQueryData(queryKey, (old: unknown) => {
        if (!old || typeof old !== 'object') return old;
        const cached = old as Record<string, unknown>;
        if (!Array.isArray(cached.data)) return old;
        return {
          ...cached,
          data: (cached.data as Record<string, unknown>[]).map((r) =>
            r.id === rowId ? { ...r, [field]: value } : r,
          ),
        };
      });

      try {
        if (customPatch && row) {
          // カスタム PATCH: 別テーブル（担当者等）への更新
          const endpoint = customPatch.endpoint(row);
          if (!endpoint || endpoint.trim() === '') {
            throw new Error('PATCH 対象が見つかりません');
          }
          // dot-notation field → nested object（例: projectCustomData.fieldKey）
          const fieldParts = customPatch.field.split('.');
          let body: Record<string, unknown>;
          if (fieldParts.length === 2) {
            body = { [fieldParts[0]]: { [fieldParts[1]]: value }, version };
          } else {
            body = { [customPatch.field]: value, version };
          }
          // extraBody があればマージ（例: businessId, version の上書き）
          if (customPatch.extraBody) {
            const extra = typeof customPatch.extraBody === 'function'
              ? customPatch.extraBody(row)
              : customPatch.extraBody;
            body = { ...body, ...extra };
          }
          const updated = await apiClient.patch<Record<string, unknown>>(endpoint, body);
          // レスポンスが親エンティティの場合のみ行置換（連絡先等の子エンティティは別スキーマ）
          const isSameEntity = updated.id === (row.id as number) && 'version' in updated;
          if (isSameEntity) {
            queryClient.setQueryData(queryKey, (old: unknown) => {
              if (!old || typeof old !== 'object') return old;
              const cached = old as Record<string, unknown>;
              if (!Array.isArray(cached.data)) return old;
              return {
                ...cached,
                data: (cached.data as Record<string, unknown>[]).map((r) =>
                  r.id === (row.id as number) ? updated : r,
                ),
              };
            });
          } else {
            // 子エンティティの場合は楽観的更新のまま、一覧を再取得して最新化
            await queryClient.invalidateQueries({ queryKey });
          }
          // 詳細・編集画面のキャッシュも無効化
          queryClient.invalidateQueries({
            queryKey: [config.entityType, String(row.id)],
          });
          // クロスエンティティ編集時: 更新先エンティティのキャッシュも無効化
          if (updated.id !== (row.id as number)) {
            // PATCH先のエンティティタイプを endpoint から推定
            const ep = endpoint.toLowerCase();
            if (ep.includes('/customers/')) {
              queryClient.invalidateQueries({
                queryKey: ['customer', String(updated.id)],
              });
              // 顧客一覧キャッシュも無効化
              queryClient.invalidateQueries({ predicate: (q) => {
                const key = q.queryKey[0];
                return typeof key === 'string' && key.startsWith('/customers');
              }});
            }
            if (ep.includes('/partners/')) {
              queryClient.invalidateQueries({
                queryKey: ['partner', String(updated.id)],
              });
              queryClient.invalidateQueries({ predicate: (q) => {
                const key = q.queryKey[0];
                return typeof key === 'string' && key.startsWith('/partners');
              }});
            }
          }
          // 顧客・代理店カスタムフィールド更新時は案件一覧キャッシュも無効化
          if (config.entityType === 'customer' || config.entityType === 'partner') {
            queryClient.invalidateQueries({ predicate: (q) => {
              const key = q.queryKey[0];
              return typeof key === 'string' && key.startsWith('/projects');
            }});
          }
        } else {
          // 通常 PATCH: 顧客テーブルへの更新
          if (!config.patchEndpoint) {
            throw new Error('patchEndpoint が設定されていません');
          }
          const endpoint = config.patchEndpoint(rowId);
          const updated = await apiClient.patch<Record<string, unknown>>(endpoint, {
            [field]: value,
            version,
          });
          // サーバーレスポンスで該当行を完全置換（新 version 取得）
          queryClient.setQueryData(queryKey, (old: unknown) => {
            if (!old || typeof old !== 'object') return old;
            const cached = old as Record<string, unknown>;
            if (!Array.isArray(cached.data)) return old;
            return {
              ...cached,
              data: (cached.data as Record<string, unknown>[]).map((r) =>
                r.id === rowId ? updated : r,
              ),
            };
          });
          // 詳細・編集画面のキャッシュも無効化（version 不整合を防ぐ）
          queryClient.invalidateQueries({
            queryKey: [config.entityType, String(rowId)],
          });
          // 顧客・代理店更新時は案件一覧キャッシュも無効化
          if (config.entityType === 'customer' || config.entityType === 'partner') {
            queryClient.invalidateQueries({ predicate: (q) => {
              const key = q.queryKey[0];
              return typeof key === 'string' && key.startsWith('/projects');
            }});
          }
        }
      } catch (error) {
        // エラー時はキャッシュをロールバック
        queryClient.setQueryData(queryKey, previousData);

        if (error instanceof ApiClientError) {
          if (error.statusCode === 409) {
            toast({
              message: '他のユーザーによって更新されています。画面をリロードしてください。',
              type: 'warning',
            });
            await queryClient.invalidateQueries({ queryKey });
          } else {
            toast({
              message: error.message,
              type: 'error',
            });
          }
        }

        throw error;
      }
    },
    [config, queryClient, toast],
  );

  return { updateCell };
}
