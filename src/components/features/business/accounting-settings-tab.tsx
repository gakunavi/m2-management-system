'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Plus, Trash2 } from 'lucide-react';

interface AccountingDefaults {
  defaultCommissionBaseRate: number | null;
  defaultDirectRate: number | null;
  defaultIndirectRate: number | null;
  billingCycleOptions: string[];
  paymentMethodOptions: string[];
}

interface BusinessData {
  id: number;
  version: number;
  businessConfig: {
    accountingDefaults?: AccountingDefaults;
    [key: string]: unknown;
  } | null;
}

interface Props {
  entityId: number;
}

export function AccountingSettingsTab({ entityId }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [saving, setSaving] = useState(false);

  const [commissionBaseRate, setCommissionBaseRate] = useState('');
  const [directRate, setDirectRate] = useState('');
  const [indirectRate, setIndirectRate] = useState('');
  const [billingCycleOptions, setBillingCycleOptions] = useState<string[]>([]);
  const [paymentMethodOptions, setPaymentMethodOptions] = useState<string[]>([]);
  const [newBillingCycle, setNewBillingCycle] = useState('');
  const [newPaymentMethod, setNewPaymentMethod] = useState('');

  const { data: businessData, isLoading } = useQuery({
    queryKey: ['business', entityId],
    queryFn: () => apiClient.get<BusinessData>(`/businesses/${entityId}`),
    enabled: !!entityId,
  });

  useEffect(() => {
    if (!businessData) return;
    const defaults = businessData.businessConfig?.accountingDefaults;
    if (defaults) {
      setCommissionBaseRate(defaults.defaultCommissionBaseRate != null ? String(defaults.defaultCommissionBaseRate) : '');
      setDirectRate(defaults.defaultDirectRate != null ? String(defaults.defaultDirectRate) : '');
      setIndirectRate(defaults.defaultIndirectRate != null ? String(defaults.defaultIndirectRate) : '');
      setBillingCycleOptions(defaults.billingCycleOptions ?? []);
      setPaymentMethodOptions(defaults.paymentMethodOptions ?? []);
    }
  }, [businessData]);

  const handleSave = async () => {
    if (!businessData) return;
    setSaving(true);
    try {
      const currentConfig = (businessData.businessConfig ?? {}) as Record<string, unknown>;
      await apiClient.patch(`/businesses/${entityId}`, {
        businessConfig: {
          ...currentConfig,
          accountingDefaults: {
            defaultCommissionBaseRate: commissionBaseRate ? parseFloat(commissionBaseRate) : null,
            defaultDirectRate: directRate ? parseFloat(directRate) : null,
            defaultIndirectRate: indirectRate ? parseFloat(indirectRate) : null,
            billingCycleOptions,
            paymentMethodOptions,
          },
        },
        version: businessData.version,
      });
      queryClient.invalidateQueries({ queryKey: ['business', entityId] });
      toast({ message: '会計設定を保存しました', type: 'success' });
    } catch {
      toast({ message: '保存に失敗しました', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const addOption = (list: string[], setList: (v: string[]) => void, value: string, setValue: (v: string) => void) => {
    const trimmed = value.trim();
    if (!trimmed || list.includes(trimmed)) return;
    setList([...list, trimmed]);
    setValue('');
  };

  const removeOption = (list: string[], setList: (v: string[]) => void, index: number) => {
    setList(list.filter((_, i) => i !== index));
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {/* デフォルト手数料率 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">デフォルト手数料率</CardTitle>
          <p className="text-sm text-muted-foreground">
            代理店を事業にリンクする際に自動セットされるデフォルト値です。
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>元請手数料率（%）</Label>
              <Input
                type="number" min="0" max="100" step="0.01"
                value={commissionBaseRate}
                onChange={(e) => setCommissionBaseRate(e.target.value)}
                placeholder="例: 20.00"
                disabled={!isAdmin}
              />
              <p className="text-xs text-muted-foreground">
                メーカーモデルの場合は100。
              </p>
            </div>
            <div className="space-y-2">
              <Label>直案件料率（%）</Label>
              <Input
                type="number" min="0" max="100" step="0.01"
                value={directRate}
                onChange={(e) => setDirectRate(e.target.value)}
                placeholder="例: 10.00"
                disabled={!isAdmin}
              />
            </div>
            <div className="space-y-2">
              <Label>間接案件料率（%）</Label>
              <Input
                type="number" min="0" max="100" step="0.01"
                value={indirectRate}
                onChange={(e) => setIndirectRate(e.target.value)}
                placeholder="例: 5.00"
                disabled={!isAdmin}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 着金サイクル選択肢 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">着金サイクル選択肢</CardTitle>
          <p className="text-sm text-muted-foreground">
            パイプライン作成時にプルダウンで選択できる着金サイクルの選択肢を管理します。
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {billingCycleOptions.map((opt, i) => (
              <div key={i} className="flex items-center gap-1 bg-muted px-3 py-1 rounded-md text-sm">
                <span>{opt}</span>
                {isAdmin && (
                  <button
                    onClick={() => removeOption(billingCycleOptions, setBillingCycleOptions, i)}
                    className="text-muted-foreground hover:text-destructive ml-1"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
            {billingCycleOptions.length === 0 && (
              <p className="text-sm text-muted-foreground">選択肢が未設定です</p>
            )}
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <Input
                value={newBillingCycle}
                onChange={(e) => setNewBillingCycle(e.target.value)}
                placeholder="例: 毎月"
                className="max-w-[200px]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addOption(billingCycleOptions, setBillingCycleOptions, newBillingCycle, setNewBillingCycle);
                  }
                }}
              />
              <Button
                variant="outline" size="sm"
                onClick={() => addOption(billingCycleOptions, setBillingCycleOptions, newBillingCycle, setNewBillingCycle)}
              >
                <Plus className="h-4 w-4 mr-1" />追加
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 支払い方法選択肢 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">支払い方法選択肢</CardTitle>
          <p className="text-sm text-muted-foreground">
            パイプライン作成時にプルダウンで選択できる支払い方法の選択肢を管理します。
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {paymentMethodOptions.map((opt, i) => (
              <div key={i} className="flex items-center gap-1 bg-muted px-3 py-1 rounded-md text-sm">
                <span>{opt}</span>
                {isAdmin && (
                  <button
                    onClick={() => removeOption(paymentMethodOptions, setPaymentMethodOptions, i)}
                    className="text-muted-foreground hover:text-destructive ml-1"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
            {paymentMethodOptions.length === 0 && (
              <p className="text-sm text-muted-foreground">選択肢が未設定です</p>
            )}
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <Input
                value={newPaymentMethod}
                onChange={(e) => setNewPaymentMethod(e.target.value)}
                placeholder="例: 全額納品日"
                className="max-w-[200px]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addOption(paymentMethodOptions, setPaymentMethodOptions, newPaymentMethod, setNewPaymentMethod);
                  }
                }}
              />
              <Button
                variant="outline" size="sm"
                onClick={() => addOption(paymentMethodOptions, setPaymentMethodOptions, newPaymentMethod, setNewPaymentMethod)}
              >
                <Plus className="h-4 w-4 mr-1" />追加
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 保存ボタン */}
      {isAdmin && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      )}
    </div>
  );
}
