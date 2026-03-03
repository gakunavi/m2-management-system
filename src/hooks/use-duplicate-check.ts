'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useDebounce } from './use-debounce';
import type { DuplicateCheckConfig } from '@/types/config';

export type DuplicateCandidate = {
  id: number;
  label: string;
};

export type DuplicateCheckResult = {
  candidates: DuplicateCandidate[];
  isChecking: boolean;
  /** 名前+電話番号の完全一致が見つかった（ブロッキング対象） */
  isExactComboMatch?: boolean;
};

/**
 * フォームフィールドの入力値で既存データを検索し、類似候補を返す共通フック。
 *
 * @param value       - フィールドの現在値
 * @param config      - DuplicateCheckConfig（undefined なら無効）
 * @param excludeId   - 編集中の自分自身のID（候補から除外）
 * @param comboValues - 複合チェック用の追加フィールド値
 */
export function useDuplicateCheck(
  value: unknown,
  config: DuplicateCheckConfig | undefined,
  excludeId?: number,
  comboValues?: Record<string, unknown>,
): DuplicateCheckResult {
  const strValue = typeof value === 'string' ? value.trim() : '';
  const debounceMs = config?.debounceMs ?? 500;
  const minLength = config?.minLength ?? 2;
  const debouncedValue = useDebounce(strValue, debounceMs);

  const hasComboFields = !!config?.comboFields && config.comboFields.length > 0;
  const enabled = !!config && debouncedValue.length >= minLength;

  // comboFields の値をシリアライズして queryKey に含める
  const comboParams = hasComboFields
    ? config!.comboFields!.map((cf) => {
        const v = comboValues?.[cf.formKey];
        return typeof v === 'string' ? v.trim() : '';
      }).join('|')
    : '';

  // 複合チェック用の専用エンドポイント
  const { data: comboData, isFetching: comboFetching } = useQuery({
    queryKey: ['duplicateCheck', 'combo', config?.endpoint, debouncedValue, comboParams],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('name', debouncedValue);
      if (excludeId != null) params.set('excludeId', String(excludeId));
      for (const cf of config!.comboFields!) {
        const v = comboValues?.[cf.formKey];
        if (v && typeof v === 'string' && v.trim()) {
          params.set(cf.paramKey, v.trim());
        }
      }
      const res = await fetch(`/api/v1${config!.endpoint}/duplicate-check?${params.toString()}`);
      if (!res.ok) return { matches: [], isExactComboMatch: false };
      const json = await res.json();
      return json.data as { matches: { id: number; code: string; name: string; phone: string | null }[]; isExactComboMatch: boolean };
    },
    enabled: enabled && hasComboFields,
    staleTime: 10_000,
  });

  // 通常の一覧APIによる類似チェック（comboFields がない場合のみ）
  const { data: listData, isFetching: listFetching } = useQuery({
    queryKey: ['duplicateCheck', config?.endpoint, debouncedValue],
    queryFn: () =>
      apiClient.getList<Record<string, unknown>>(config!.endpoint, {
        search: debouncedValue,
        pageSize: 5,
      }),
    enabled: enabled && !hasComboFields,
    staleTime: 10_000,
  });

  if (!enabled) {
    return { candidates: [], isChecking: false };
  }

  // 複合チェックモード
  if (hasComboFields) {
    const candidates: DuplicateCandidate[] = (comboData?.matches ?? [])
      .filter((m) => excludeId == null || m.id !== excludeId)
      .map((m) => ({
        id: m.id,
        label: `${m.code}: ${m.name}${m.phone ? ` (${m.phone})` : ''}`,
      }));
    return {
      candidates,
      isChecking: comboFetching,
      isExactComboMatch: comboData?.isExactComboMatch ?? false,
    };
  }

  // 通常モード
  const candidates: DuplicateCandidate[] = (listData?.data ?? [])
    .filter((item) => {
      if (excludeId != null && item.id === excludeId) return false;
      return true;
    })
    .map((item) => ({
      id: item.id as number,
      label: String(item[config!.labelField] ?? ''),
    }));

  return { candidates, isChecking: listFetching };
}
