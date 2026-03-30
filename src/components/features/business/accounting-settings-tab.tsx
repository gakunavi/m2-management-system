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

interface BusinessData {
  id: number;
  version: number;
  businessConfig: {
    accountingDefaults?: {
      defaultCommissionBaseRate: number | null;
      defaultDirectRate: number | null;
      defaultIndirectRate: number | null;
    };
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

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">デフォルト手数料率設定</CardTitle>
          <p className="text-sm text-muted-foreground">
            代理店を事業にリンクする際に自動セットされるデフォルト値です。代理店ごとに個別変更も可能です。
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>元請手数料率（%）</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={commissionBaseRate}
                onChange={(e) => setCommissionBaseRate(e.target.value)}
                placeholder="例: 20.00"
                disabled={!isAdmin}
              />
              <p className="text-xs text-muted-foreground">
                メーカーから受け取る全体の手数料率。メーカーモデルの場合は100。
              </p>
            </div>
            <div className="space-y-2">
              <Label>直案件料率（%）</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={directRate}
                onChange={(e) => setDirectRate(e.target.value)}
                placeholder="例: 10.00"
                disabled={!isAdmin}
              />
              <p className="text-xs text-muted-foreground">
                代理店が直接紹介した案件に適用される手数料率。
              </p>
            </div>
            <div className="space-y-2">
              <Label>間接案件料率（%）</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={indirectRate}
                onChange={(e) => setIndirectRate(e.target.value)}
                placeholder="例: 5.00"
                disabled={!isAdmin}
              />
              <p className="text-xs text-muted-foreground">
                下位代理店が紹介した案件に適用される間接手数料率。
              </p>
            </div>
          </div>
          {isAdmin && (
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
