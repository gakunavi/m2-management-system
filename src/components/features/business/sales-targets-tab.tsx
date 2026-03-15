'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getCurrentFiscalYear, getFiscalYearMonths, getMonthLabel } from '@/lib/revenue-helpers';
import type { SalesTargetResponse, KpiDefinition } from '@/types/dashboard';

interface Props {
  entityId: number;
}

interface BusinessData {
  id: number;
  businessConfig: {
    kpiDefinitions?: KpiDefinition[];
  } | null;
}

function formatValue(amount: number, unit: string): string {
  if (unit === '円') {
    return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(amount);
  }
  return `${amount.toLocaleString()}${unit}`;
}

function formatRate(rate: number | null): string {
  if (rate === null) return '-';
  return `${rate.toFixed(1)}%`;
}

export function SalesTargetsTab({ entityId }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [year, setYear] = useState(getCurrentFiscalYear);
  const [selectedKpiKey, setSelectedKpiKey] = useState<string>('');
  const [editTargets, setEditTargets] = useState<Record<string, number>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [bulkAmount, setBulkAmount] = useState('');

  // 事業データからKPI定義一覧を取得
  const { data: businessData } = useQuery({
    queryKey: ['business', entityId],
    queryFn: () => apiClient.get<BusinessData>(`/businesses/${entityId}`),
    enabled: !!entityId,
  });

  const kpiDefinitions = useMemo<KpiDefinition[]>(
    () => businessData?.businessConfig?.kpiDefinitions ?? [],
    [businessData],
  );

  // 初回 or KPI定義変更時にデフォルト選択
  useEffect(() => {
    if (kpiDefinitions.length > 0 && !selectedKpiKey) {
      const primary = kpiDefinitions.find((k) => k.isPrimary);
      setSelectedKpiKey(primary?.key ?? kpiDefinitions[0].key);
    }
  }, [kpiDefinitions, selectedKpiKey]);

  const currentKpi = kpiDefinitions.find((k) => k.key === selectedKpiKey);
  const unit = currentKpi?.unit ?? '円';

  const queryKey = ['sales-targets', entityId, year, selectedKpiKey];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      apiClient.get<SalesTargetResponse>(
        `/businesses/${entityId}/sales-targets?year=${year}&kpiKey=${selectedKpiKey}`,
      ),
    enabled: !!entityId && !!selectedKpiKey,
  });

  useEffect(() => {
    if (data && isEditing) {
      const targets: Record<string, number> = {};
      for (const m of data.months) {
        targets[m.month] = m.targetAmount;
      }
      setEditTargets(targets);
    }
  }, [data, isEditing]);

  const saveMutation = useMutation({
    mutationFn: async (targets: Record<string, number>) => {
      const fiscalMonths = getFiscalYearMonths(year);
      return apiClient.put(`/businesses/${entityId}/sales-targets`, {
        year,
        kpiKey: selectedKpiKey,
        targets: fiscalMonths.map((month) => ({
          month,
          targetAmount: targets[month] ?? 0,
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setIsEditing(false);
      toast({ message: '売上目標を保存しました', type: 'success' });
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : '保存に失敗しました';
      toast({ title: 'エラー', message: msg, type: 'error' });
    },
  });

  const handleStartEdit = useCallback(() => {
    if (data) {
      const targets: Record<string, number> = {};
      for (const m of data.months) {
        targets[m.month] = m.targetAmount;
      }
      setEditTargets(targets);
      setIsEditing(true);
    }
  }, [data]);

  const handleBulkInput = () => {
    const amount = parseInt(bulkAmount, 10);
    if (isNaN(amount) || amount < 0) return;

    const fiscalMonths = getFiscalYearMonths(year);
    const newTargets: Record<string, number> = {};
    for (const month of fiscalMonths) {
      newTargets[month] = amount;
    }
    setEditTargets(newTargets);
    setBulkAmount('');
  };

  const handleSave = () => {
    saveMutation.mutate(editTargets);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditTargets({});
  };

  const handleKpiChange = (key: string) => {
    if (isEditing) {
      setIsEditing(false);
      setEditTargets({});
    }
    setSelectedKpiKey(key);
  };

  if (kpiDefinitions.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          KPIが未定義です。「KPI定義」タブでKPIを追加してください。
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <div className="p-6 text-muted-foreground text-sm">読み込み中...</div>;
  }

  const months = data?.months ?? [];
  const yearTotal = data?.yearTotal;
  const hasKpiDefinition = !!data?.kpiDefinition;

  return (
    <div className="space-y-4">
      {/* KPIタブ切替（2つ以上ある場合） */}
      {kpiDefinitions.length > 1 && (
        <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
          {kpiDefinitions.map((kpi) => (
            <button
              key={kpi.key}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                selectedKpiKey === kpi.key
                  ? 'bg-background shadow-sm font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => handleKpiChange(kpi.key)}
            >
              {kpi.label}
            </button>
          ))}
        </div>
      )}

      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setYear((y) => y - 1)}
            aria-label="前年度"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-lg font-semibold">{year}年度</span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setYear((y) => y + 1)}
            aria-label="翌年度"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {isAdmin && !isEditing && (
          <Button onClick={handleStartEdit} size="sm">
            目標を編集
          </Button>
        )}
      </div>

      {/* 一括入力 */}
      {isEditing && (
        <div className="flex items-center gap-2 p-3 rounded-md border bg-muted/30">
          <span className="text-sm text-muted-foreground">一括入力:</span>
          <input
            type="number"
            className="w-40 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            placeholder={`月額を入力（${unit}）`}
            value={bulkAmount}
            onChange={(e) => setBulkAmount(e.target.value)}
          />
          <Button variant="outline" size="sm" onClick={handleBulkInput}>
            全月に適用
          </Button>
        </div>
      )}

      {/* テーブル */}
      <div className="border rounded-lg overflow-auto max-h-[calc(100vh-400px)]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-20 bg-background">
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 font-medium w-24">月</th>
              <th className="text-right px-4 py-3 font-medium">目標（{unit}）</th>
              <th className="text-right px-4 py-3 font-medium">実績（{unit}）</th>
              <th className="text-right px-4 py-3 font-medium w-24">達成率</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month} className="border-b last:border-b-0 hover:bg-muted/30">
                <td className="px-4 py-2.5 font-medium">{getMonthLabel(m.month)}</td>
                <td className="px-4 py-2.5 text-right">
                  {isEditing ? (
                    <input
                      type="number"
                      className="w-40 text-right rounded-md border border-input bg-background px-3 py-1 text-sm"
                      value={editTargets[m.month] ?? 0}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setEditTargets((prev) => ({
                          ...prev,
                          [m.month]: isNaN(val) ? 0 : Math.max(0, val),
                        }));
                      }}
                    />
                  ) : (
                    formatValue(m.targetAmount, unit)
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {hasKpiDefinition ? (
                    formatValue(m.actualAmount, unit)
                  ) : (
                    <span className="text-muted-foreground text-xs">KPI未設定</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {hasKpiDefinition ? (
                    <span
                      className={
                        m.achievementRate !== null && m.achievementRate >= 100
                          ? 'text-green-600 font-medium'
                          : ''
                      }
                    >
                      {isEditing ? '-' : formatRate(m.achievementRate)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
              </tr>
            ))}

            {/* 年間計 */}
            {yearTotal && (
              <tr className="border-t-2 bg-muted/50 font-medium">
                <td className="px-4 py-3">年間計</td>
                <td className="px-4 py-3 text-right">
                  {isEditing
                    ? formatValue(
                        Object.values(editTargets).reduce((sum, v) => sum + v, 0),
                        unit,
                      )
                    : formatValue(yearTotal.targetAmount, unit)}
                </td>
                <td className="px-4 py-3 text-right">
                  {hasKpiDefinition ? formatValue(yearTotal.actualAmount, unit) : '-'}
                </td>
                <td className="px-4 py-3 text-right">
                  {isEditing ? '-' : formatRate(yearTotal.achievementRate)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 編集ボタン */}
      {isEditing && (
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? '保存中...' : '保存'}
          </Button>
          <Button variant="outline" onClick={handleCancel}>
            キャンセル
          </Button>
        </div>
      )}

      {!hasKpiDefinition && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          KPIが未定義のため、実績は表示されません。
          「KPI定義」タブで設定してください。
        </div>
      )}
    </div>
  );
}
