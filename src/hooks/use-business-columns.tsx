'use client';

import { useMemo, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Checkbox } from '@/components/ui/checkbox';
import { useBusiness } from '@/hooks/use-business';
import { useToast } from '@/hooks/use-toast';
import type { EntityListConfig, ColumnDef } from '@/types/config';

// ============================================
// 代理店用トグルセル（インライン編集）
// ============================================

function PartnerBusinessToggleCell({
  row,
  bizId,
  apiEndpoint,
}: {
  row: Record<string, unknown>;
  bizId: number;
  apiEndpoint: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isPending, setIsPending] = useState(false);

  const linkIds = (row.businessLinkIds as number[]) ?? [];
  const isLinked = linkIds.includes(bizId);

  // apiEndpoint をキーの先頭にもつクエリに一致する predicate
  const queryPredicate = useCallback(
    (query: { queryKey: readonly unknown[] }) => {
      return Array.isArray(query.queryKey) && query.queryKey[0] === apiEndpoint;
    },
    [apiEndpoint],
  );

  const handleToggle = useCallback(async () => {
    setIsPending(true);
    try {
      const res = await fetch(`/api/v1/partners/${row.id}/business-links/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: bizId, linked: !isLinked }),
      });
      if (!res.ok) throw new Error('更新に失敗しました');

      const json = await res.json();
      const newLinkIds: number[] = json.data.businessLinkIds;

      // apiEndpoint をキーにもつ全クエリのキャッシュを更新
      queryClient.setQueriesData(
        { predicate: queryPredicate },
        (old: unknown) => {
          if (!old || typeof old !== 'object') return old;
          const cached = old as Record<string, unknown>;
          if (!Array.isArray(cached.data)) return old;
          return {
            ...cached,
            data: (cached.data as Record<string, unknown>[]).map((r) =>
              r.id === row.id ? { ...r, businessLinkIds: newLinkIds } : r,
            ),
          };
        },
      );
    } catch {
      toast({ message: '事業リンクの更新に失敗しました', type: 'error' });
      queryClient.invalidateQueries({ predicate: queryPredicate });
    } finally {
      setIsPending(false);
    }
  }, [queryClient, queryPredicate, row.id, bizId, isLinked, toast]);

  return (
    <Checkbox
      checked={isLinked}
      onCheckedChange={handleToggle}
      disabled={isPending}
      aria-label={isLinked ? '事業リンクを解除' : '事業をリンク'}
    />
  );
}

// ============================================
// useBusinessColumns フック
// ============================================

/**
 * 一覧テーブルに動的な事業列を追加するフック。
 * - 全事業ごとに ✓ / - のチェック列を挿入
 * - 代理店一覧ではチェックボックスでインライントグル
 * - 事業選択時はその事業にリンクしたもののみ表示（?businessId=X）
 */
export function useBusinessColumns(
  baseConfig: EntityListConfig,
  entityType: 'customer' | 'partner',
): { config: EntityListConfig } {
  const { businesses, selectedBusinessId } = useBusiness();

  const config = useMemo(() => {
    // apiEndpoint に businessId クエリを追加
    let apiEndpoint = baseConfig.apiEndpoint;
    if (selectedBusinessId != null) {
      const separator = apiEndpoint.includes('?') ? '&' : '?';
      apiEndpoint = `${apiEndpoint}${separator}businessId=${selectedBusinessId}`;
    }

    // 事業列を生成
    const businessColumns: ColumnDef[] = businesses.map((biz) => ({
      key: `biz_${biz.id}`,
      label: biz.businessName,
      width: 80,
      align: 'center' as const,
      sortable: false,
      defaultVisible: true,
      render: (_value: unknown, row: Record<string, unknown>) => {
        if (entityType === 'partner') {
          return (
            <PartnerBusinessToggleCell
              row={row}
              bizId={biz.id}
              apiEndpoint={apiEndpoint}
            />
          );
        }
        // 顧客: 読み取り専用 ✓/-
        const linkIds = (row.businessLinkIds as number[]) ?? [];
        return linkIds.includes(biz.id) ? '✓' : '-';
      },
    }));

    return {
      ...baseConfig,
      apiEndpoint,
      columns: [...baseConfig.columns, ...businessColumns],
    };
  }, [baseConfig, businesses, selectedBusinessId, entityType]);

  return { config };
}
