'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  buildMovementSortOptions,
  resolveMovementDefaultSort,
  type MovementSortDirection,
} from '@/lib/movement-sort';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';

interface BusinessData {
  id: number;
  version: number;
  businessConfig: {
    projectFields?: ProjectFieldDefinition[];
    movementSettings?: Record<string, unknown>;
  } | null;
}

interface Props {
  entityId: number;
}

const NONE = '';

/**
 * 案件ムーブメントの「案件情報」列を、開いた直後にどの項目で並べるかの設定。
 * 並び替え候補は「ムーブメントに表示する」項目（showOnMovement）と同じ。
 * 表示していない項目を候補にすると何順か画面から分からなくなるため。
 */
export function MovementSortSettings({ entityId }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [sortKey, setSortKey] = useState<string>(NONE);
  const [direction, setDirection] = useState<MovementSortDirection>('asc');

  const { data: business, isLoading } = useQuery({
    queryKey: ['business', entityId],
    queryFn: () => apiClient.get<BusinessData>(`/businesses/${entityId}`),
    enabled: !!entityId,
  });

  const options = useMemo(
    () => buildMovementSortOptions(business?.businessConfig?.projectFields ?? []),
    [business],
  );

  useEffect(() => {
    if (!business) return;
    const resolved = resolveMovementDefaultSort(
      business.businessConfig?.movementSettings?.defaultSort,
      options,
    );
    setSortKey(resolved?.key ?? NONE);
    setDirection(resolved?.direction ?? 'asc');
  }, [business, options]);

  const handleSave = async () => {
    if (!business) return;
    setSaving(true);
    try {
      await apiClient.patch(`/businesses/${entityId}`, {
        businessConfig: {
          // businessConfig はトップレベルの浅いマージなので、
          // movementSettings の他キーは自前で引き継ぐ
          movementSettings: {
            ...(business.businessConfig?.movementSettings ?? {}),
            defaultSort: sortKey ? { key: sortKey, direction } : null,
          },
        },
        version: business.version,
      });
      queryClient.invalidateQueries({ queryKey: ['business', entityId] });
      queryClient.invalidateQueries({ queryKey: ['project-movements-overview'] });
      toast({ message: '既定の並び順を保存しました', type: 'success' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : '保存に失敗しました';
      toast({ title: 'エラー', message: msg, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">読み込み中...</div>;
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div>
        <h4 className="text-sm font-semibold">案件ムーブメントの既定の並び順</h4>
        <p className="text-xs text-muted-foreground mt-1">
          ムーブメント画面を開いたときの「案件情報」列の並び順です。
          候補には受注予定月・顧客名・代理店名と、案件フィールドで
          「案件ムーブメントに表示する」を有効にした項目が並びます。
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
          aria-label="既定の並び替え項目"
        >
          <option value={NONE}>設定しない（並び替えなし）</option>
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value === 'desc' ? 'desc' : 'asc')}
          disabled={!sortKey}
          className="h-9 rounded-md border bg-background px-2 text-sm disabled:opacity-50"
          aria-label="既定の並び順"
        >
          <option value="asc">昇順</option>
          <option value="desc">降順</option>
        </select>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </Button>
      </div>
    </div>
  );
}
