'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import { TabCsvImport } from '@/components/shared/tab-csv-import';
import { KPI_DEFINITION_TEMPLATE_COLUMNS } from '@/lib/csv-helpers';
import type { StatusDefinition } from '@/hooks/use-status-definitions';
import type { KpiDefinition } from '@/types/dashboard';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';

interface BusinessData {
  id: number;
  version: number;
  businessConfig: {
    projectFields?: ProjectFieldDefinition[];
    revenueRecognition?: { statusCode: string; amountField: string; dateField: string } | null;
    kpiDefinitions?: KpiDefinition[];
  } | null;
}

interface Props {
  entityId: number;
}

const EMPTY_KPI: KpiDefinition = {
  key: '',
  label: '',
  unit: '円',
  aggregation: 'sum',
  sourceField: null,
  statusFilter: null,
  dateField: 'projectExpectedCloseMonth',
  isPrimary: false,
  sortOrder: 0,
};

export function RevenueRecognitionSettings({ entityId }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [saving, setSaving] = useState(false);
  const [kpis, setKpis] = useState<KpiDefinition[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<number, string[]>>({});

  const { data: businessData, isLoading: businessLoading } = useQuery({
    queryKey: ['business', entityId],
    queryFn: () => apiClient.get<BusinessData>(`/businesses/${entityId}`),
    enabled: !!entityId,
  });

  const { data: statusDefs = [], isLoading: statusLoading } = useQuery({
    queryKey: ['status-definitions', entityId],
    queryFn: () => apiClient.get<StatusDefinition[]>(`/businesses/${entityId}/status-definitions`),
    enabled: !!entityId,
  });

  useEffect(() => {
    if (!businessData) return;
    const config = businessData.businessConfig;
    if (config?.kpiDefinitions && config.kpiDefinitions.length > 0) {
      setKpis(config.kpiDefinitions);
    } else if (config?.revenueRecognition) {
      // レガシーデータからの移行
      const rr = config.revenueRecognition;
      setKpis([
        {
          key: 'revenue',
          label: '売上金額',
          unit: '円',
          aggregation: 'sum',
          sourceField: rr.amountField,
          statusFilter: rr.statusCode,
          dateField: rr.dateField,
          isPrimary: true,
          sortOrder: 0,
        },
      ]);
    } else {
      setKpis([]);
    }
  }, [businessData]);

  const projectFields: ProjectFieldDefinition[] =
    businessData?.businessConfig?.projectFields ?? [];
  const numberFields = projectFields.filter((f) => f.type === 'number' || f.type === 'formula');
  const dateFields = projectFields.filter((f) => f.type === 'date' || f.type === 'month');

  const validate = (items: KpiDefinition[]): Record<number, string[]> => {
    const errs: Record<number, string[]> = {};
    const keys = new Set<string>();
    let primaryCount = 0;

    items.forEach((kpi, i) => {
      const itemErrors: string[] = [];
      if (!kpi.key) itemErrors.push('キーは必須です');
      else if (!/^[a-z][a-z0-9_]*$/.test(kpi.key)) itemErrors.push('キーは英小文字・数字・アンダースコアのみ');
      if (keys.has(kpi.key)) itemErrors.push('キーが重複しています');
      keys.add(kpi.key);
      if (!kpi.label) itemErrors.push('ラベルは必須です');
      if (!kpi.unit) itemErrors.push('単位は必須です');
      if (kpi.aggregation === 'sum' && !kpi.sourceField) itemErrors.push('合計集計にはソースフィールドが必要です');
      if (!kpi.dateField) itemErrors.push('計上月基準は必須です');
      if (kpi.isPrimary) primaryCount++;
      if (itemErrors.length > 0) errs[i] = itemErrors;
    });

    if (primaryCount > 1) {
      items.forEach((kpi, i) => {
        if (kpi.isPrimary) {
          errs[i] = [...(errs[i] || []), 'プライマリKPIは1つのみ設定できます'];
        }
      });
    }

    return errs;
  };

  const handleAdd = () => {
    const newKpi: KpiDefinition = {
      ...EMPTY_KPI,
      sortOrder: kpis.length,
      isPrimary: kpis.length === 0,
    };
    setKpis((prev) => [...prev, newKpi]);
    setExpandedIndex(kpis.length);
  };

  const handleRemove = (index: number) => {
    setKpis((prev) => prev.filter((_, i) => i !== index));
    setExpandedIndex(null);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const handleUpdate = (index: number, field: keyof KpiDefinition, value: unknown) => {
    setKpis((prev) =>
      prev.map((kpi, i) => {
        if (i !== index) {
          // isPrimary を排他に
          if (field === 'isPrimary' && value === true) {
            return { ...kpi, isPrimary: false };
          }
          return kpi;
        }
        const updated = { ...kpi, [field]: value };
        // aggregation が count に変わったら sourceField クリア
        if (field === 'aggregation' && value === 'count') {
          updated.sourceField = null;
        }
        return updated;
      }),
    );
  };

  const handleSave = async () => {
    if (!businessData) return;

    const validationErrors = validate(kpis);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      toast({ title: 'バリデーションエラー', message: '入力内容を確認してください', type: 'error' });
      return;
    }

    setSaving(true);
    try {
      // sortOrder を再割り当て
      const sortedKpis = kpis.map((kpi, i) => ({ ...kpi, sortOrder: i }));

      // 後方互換: プライマリ KPI から revenueRecognition も生成
      const primaryKpi = sortedKpis.find((k) => k.isPrimary);
      const primaryStatusFilter = primaryKpi?.statusFilter;
      const rrStatusCode = Array.isArray(primaryStatusFilter)
        ? primaryStatusFilter[0] ?? ''
        : primaryStatusFilter || '';
      const revenueRecognition = primaryKpi && primaryKpi.aggregation === 'sum' && primaryKpi.sourceField
        ? {
            statusCode: rrStatusCode,
            amountField: primaryKpi.sourceField,
            dateField: primaryKpi.dateField,
          }
        : null;

      await apiClient.patch(`/businesses/${entityId}`, {
        businessConfig: {
          kpiDefinitions: sortedKpis,
          revenueRecognition,
        },
        version: businessData.version,
      });
      queryClient.invalidateQueries({ queryKey: ['business', entityId] });
      toast({ message: 'KPI定義を保存しました', type: 'success' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : '保存に失敗しました';
      toast({ title: 'エラー', message: msg, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const isLoading = businessLoading || statusLoading;
  if (isLoading) {
    return <div className="p-6 text-muted-foreground text-sm">読み込み中...</div>;
  }

  const canEdit = isAdmin;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">KPI定義</h3>
        <p className="text-sm text-muted-foreground mt-1">
          ダッシュボードと売上目標で使用するKPIを定義します。事業ごとに複数のKPIを設定できます。
        </p>
      </div>

      {kpis.length === 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          KPIが未定義です。「KPIを追加」ボタンから最初のKPIを追加してください。
        </div>
      )}

      <div className="space-y-3">
        {kpis.map((kpi, index) => {
          const isExpanded = expandedIndex === index;
          const itemErrors = errors[index];
          return (
            <div
              key={index}
              className={`border rounded-lg ${itemErrors ? 'border-red-300' : 'border-border'}`}
            >
              {/* カードヘッダー */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30"
                onClick={() => setExpandedIndex(isExpanded ? null : index)}
              >
                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">
                      {kpi.label || '(未設定)'}
                    </span>
                    <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {kpi.key || '?'}
                    </code>
                    {kpi.isPrimary && (
                      <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                        プライマリ
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {kpi.aggregation === 'sum' ? '合計' : 'カウント'} / {kpi.unit}
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>

              {/* 展開フォーム */}
              {isExpanded && (
                <div className="border-t px-4 py-4 space-y-4">
                  {itemErrors && (
                    <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                      {itemErrors.map((e, i) => (
                        <p key={i}>{e}</p>
                      ))}
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    {/* キー */}
                    <div>
                      <label className="block text-sm font-medium mb-1">キー</label>
                      <input
                        type="text"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder="例: revenue, unit_count"
                        value={kpi.key}
                        onChange={(e) => handleUpdate(index, 'key', e.target.value)}
                        disabled={!canEdit}
                      />
                      <p className="text-xs text-muted-foreground mt-1">英小文字・数字・アンダースコア</p>
                    </div>

                    {/* ラベル */}
                    <div>
                      <label className="block text-sm font-medium mb-1">ラベル</label>
                      <input
                        type="text"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder="例: 売上金額, 販売台数"
                        value={kpi.label}
                        onChange={(e) => handleUpdate(index, 'label', e.target.value)}
                        disabled={!canEdit}
                      />
                    </div>

                    {/* 単位 */}
                    <div>
                      <label className="block text-sm font-medium mb-1">単位</label>
                      <input
                        type="text"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder="例: #円, ¥#, #台, #件"
                        value={kpi.unit}
                        onChange={(e) => handleUpdate(index, 'unit', e.target.value)}
                        disabled={!canEdit}
                      />
                      <p className="text-xs text-muted-foreground mt-1"># が数値に置換されます（例: #円→1,000円、¥#→¥1,000）</p>
                    </div>

                    {/* 集計方法 */}
                    <div>
                      <label className="block text-sm font-medium mb-1">集計方法</label>
                      <select
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={kpi.aggregation}
                        onChange={(e) => handleUpdate(index, 'aggregation', e.target.value)}
                        disabled={!canEdit}
                      >
                        <option value="sum">合計（フィールド値を合算）</option>
                        <option value="count">カウント（案件数）</option>
                      </select>
                    </div>

                    {/* ソースフィールド（sum 時のみ） */}
                    {kpi.aggregation === 'sum' && (
                      <div>
                        <label className="block text-sm font-medium mb-1">金額フィールド</label>
                        <select
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={kpi.sourceField || ''}
                          onChange={(e) => handleUpdate(index, 'sourceField', e.target.value || null)}
                          disabled={!canEdit}
                        >
                          <option value="">選択してください</option>
                          {numberFields.map((f) => (
                            <option key={f.key} value={f.key}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-muted-foreground mt-1">案件カスタムフィールドの数値型から選択</p>
                      </div>
                    )}

                    {/* ステータスフィルタ（複数選択） */}
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium mb-1">対象ステータス（複数選択可）</label>
                      <div className="rounded-md border border-input bg-background p-3">
                        {statusDefs.filter((s) => s.statusIsActive).length === 0 ? (
                          <p className="text-sm text-muted-foreground">ステータスが未定義です</p>
                        ) : (
                          <div className="flex flex-wrap gap-3">
                            {statusDefs
                              .filter((s) => s.statusIsActive)
                              .map((s) => {
                                const currentFilters = kpi.statusFilter
                                  ? Array.isArray(kpi.statusFilter)
                                    ? kpi.statusFilter
                                    : [kpi.statusFilter]
                                  : [];
                                const isChecked = currentFilters.includes(s.statusCode);
                                return (
                                  <label
                                    key={s.statusCode}
                                    className="flex items-center gap-1.5 text-sm cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {
                                        if (!canEdit) return;
                                        let newFilters: string[];
                                        if (isChecked) {
                                          newFilters = currentFilters.filter((c) => c !== s.statusCode);
                                        } else {
                                          newFilters = [...currentFilters, s.statusCode];
                                        }
                                        handleUpdate(
                                          index,
                                          'statusFilter',
                                          newFilters.length > 0 ? newFilters : null,
                                        );
                                      }}
                                      disabled={!canEdit}
                                      className="rounded border-input"
                                    />
                                    <span
                                      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                                      style={{ backgroundColor: s.statusColor ?? '#6b7280' }}
                                    />
                                    {s.statusLabel}
                                  </label>
                                );
                              })}
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        チェックしたステータスの案件のみ集計（未選択=全ステータス）
                      </p>
                    </div>

                    {/* 計上月基準 */}
                    <div>
                      <label className="block text-sm font-medium mb-1">計上月基準</label>
                      <select
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={kpi.dateField}
                        onChange={(e) => handleUpdate(index, 'dateField', e.target.value)}
                        disabled={!canEdit}
                      >
                        <option value="projectExpectedCloseMonth">受注予定月</option>
                        {dateFields.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* プライマリ */}
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <input
                        type="checkbox"
                        id={`primary-${index}`}
                        checked={kpi.isPrimary}
                        onChange={(e) => handleUpdate(index, 'isPrimary', e.target.checked)}
                        disabled={!canEdit}
                        className="rounded border-input"
                      />
                      <label htmlFor={`primary-${index}`} className="text-sm">
                        プライマリKPI（ダッシュボードのデフォルト表示）
                      </label>
                    </div>
                  </div>

                  {canEdit && (
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleRemove(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        このKPIを削除
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {canEdit && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleAdd}>
            <Plus className="h-4 w-4 mr-1" />
            KPIを追加
          </Button>
          <TabCsvImport
            endpoint={`/businesses/${entityId}/kpi-definitions/csv`}
            templateColumns={KPI_DEFINITION_TEMPLATE_COLUMNS}
            onImportComplete={() => {
              queryClient.invalidateQueries({ queryKey: ['business', entityId] });
            }}
          />
          {kpis.length > 0 && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
