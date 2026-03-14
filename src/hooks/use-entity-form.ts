'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { useToast } from './use-toast';
import type { EntityFormConfig } from '@/types/config';

/**
 * ドット記法のフラットキーをネストされたオブジェクトに変換する。
 * 例: { "projectCustomData.needs": "value", "name": "test" }
 *   → { projectCustomData: { needs: "value" }, name: "test" }
 */
function unflattenDotKeys(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const dotIndex = key.indexOf('.');
    if (dotIndex > 0) {
      const parent = key.substring(0, dotIndex);
      const child = key.substring(dotIndex + 1);
      if (!result[parent] || typeof result[parent] !== 'object') {
        result[parent] = {};
      }
      (result[parent] as Record<string, unknown>)[child] = value;
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * ネストされたオブジェクトをドット記法のフラットキーに展開する。
 * 例: { projectCustomData: { needs: "value" } }
 *   → { "projectCustomData.needs": "value" }
 * ※ 対象は Record<string, unknown> 型の値のみ（配列・Date等は展開しない）
 */
function flattenNestedToFormKeys(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !(value instanceof Date) &&
      // projectCustomData 等のネストされたオブジェクトのみ展開
      key.endsWith('CustomData')
    ) {
      for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
        result[`${key}.${childKey}`] = childValue;
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function useEntityForm(config: EntityFormConfig, id?: string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const mode = id ? 'edit' : 'create';

  // ユーザーが編集した差分のみ保持（新規作成時は defaultValues で初期化）
  const [localEdits, setLocalEdits] = useState<Record<string, unknown>>(
    mode === 'create' && config.defaultValues ? { ...config.defaultValues } : {}
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // 編集モード：既存データ取得（常に最新を取得して version 不整合を防ぐ）
  const { data: fetchedData, isLoading } = useQuery({
    queryKey: [config.entityType, id],
    queryFn: async () => {
      const res = await fetch(`/api/v1${config.apiEndpoint}/${id!}`);
      if (!res.ok) throw new Error('データの取得に失敗しました');
      const json = await res.json() as { data: Record<string, unknown> };
      return json.data;
    },
    enabled: mode === 'edit' && !!id,
    staleTime: 0,
  });

  // 取得データ + ユーザー編集差分 = 最終フォームデータ（同期的に導出）
  // 編集時: fetchedData のネストされたオブジェクト（projectCustomData 等）を
  // ドット記法に展開してフォームフィールドキーと一致させる
  const formData = useMemo<Record<string, unknown>>(() => {
    if (fetchedData) {
      const expanded = flattenNestedToFormKeys(fetchedData);
      return { ...expanded, ...localEdits };
    }
    return localEdits;
  }, [fetchedData, localEdits]);

  const setField = useCallback((key: string, value: unknown) => {
    setLocalEdits((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setIsDirty(true);
  }, []);

  const submit = useCallback(async () => {
    setIsSubmitting(true);
    setErrors({});

    // ドット記法をネストされたオブジェクトに変換（バリデーション・API送信用）
    const submissionData = unflattenDotKeys(formData);

    // --- フロント側 Zod バリデーション ---
    const schema = config.validationSchema;
    if (schema && typeof schema === 'object' && 'safeParse' in schema) {
      const zodSchema = schema as z.ZodType;
      const result = zodSchema.safeParse(submissionData);
      if (!result.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of result.error.issues) {
          // ネストされたパスをドット記法に変換してフォームフィールドと一致させる
          const fieldKey = issue.path.length > 1
            ? issue.path.join('.')
            : String(issue.path[0]);
          if (!fieldErrors[fieldKey]) {
            fieldErrors[fieldKey] = issue.message;
          }
        }
        setErrors(fieldErrors);
        setIsSubmitting(false);

        // 最初のエラーフィールドにスクロール
        const firstKey = Object.keys(fieldErrors)[0];
        if (firstKey) {
          const el = document.getElementById(`field-${firstKey}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.focus();
          } else {
            // UIに表示されない隠しフィールドのエラーはトーストで通知
            const messages = Object.entries(fieldErrors)
              .filter(([key]) => !document.getElementById(`field-${key}`))
              .map(([, msg]) => msg);
            if (messages.length > 0) {
              toast({ message: messages.join(', '), type: 'error' });
            }
          }
        }
        return;
      }
    }

    try {
      let result: { id: number };
      if (mode === 'create') {
        result = await apiClient.create<{ id: number }>(config.apiEndpoint, submissionData);
      } else {
        // 編集時は PATCH（部分更新 + 楽観的ロック）
        result = await apiClient.patch<{ id: number }>(
          `${config.apiEndpoint}/${id!}`,
          submissionData,
        );
      }

      toast({
        message: mode === 'create' ? '作成しました' : '更新しました',
        type: 'success',
      });

      // 一覧・詳細のキャッシュを無効化して最新データを反映
      // 一覧: queryKey = ['/projects?businessId=X', ...]
      // 詳細/フォーム: queryKey = ['project', id]
      await queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          if (typeof key !== 'string') return false;
          return key.startsWith(config.apiEndpoint) || key === config.entityType;
        },
      });

      // 保存成功後は isDirty をリセットして離脱警告を抑止
      setIsDirty(false);
      router.push(config.redirectAfterSave(result.id));
    } catch (error: unknown) {
      if (error instanceof ApiClientError && error.details?.length) {
        // API側バリデーションエラー → フィールドごとにエラー表示
        const fieldErrors: Record<string, string> = {};
        for (const detail of error.details) {
          if (detail.field && !fieldErrors[detail.field]) {
            fieldErrors[detail.field] = detail.message;
          }
        }
        if (Object.keys(fieldErrors).length > 0) {
          setErrors(fieldErrors);
          const firstKey = Object.keys(fieldErrors)[0];
          if (firstKey) {
            const el = document.getElementById(`field-${firstKey}`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el?.focus();
          }
        }
        toast({ message: error.message, type: 'error' });
      } else if (error instanceof Error) {
        toast({ message: error.message, type: 'error' });
      } else {
        toast({ message: '予期しないエラーが発生しました', type: 'error' });
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [mode, formData, config, id, toast, router]);

  const reset = useCallback(() => {
    setLocalEdits({});
    setErrors({});
    setIsDirty(false);
  }, []);

  return {
    formData,
    setField,
    errors,
    submit,
    isSubmitting,
    mode: mode as 'create' | 'edit',
    isLoading,
    isDirty,
    reset,
  };
}
