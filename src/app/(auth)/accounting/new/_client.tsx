'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/hooks/use-toast';
import { useBusiness } from '@/hooks/use-business';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';

export function AccountingPipelineNewClient() {
  const router = useRouter();
  const { toast } = useToast();
  const { selectedBusinessId } = useBusiness();

  const [form, setForm] = useState({
    projectId: '',
    revenueType: 'SHOT' as 'SHOT' | 'STOCK',
    unitPrice: '',
    quantity: '1',
    billingCycle: '',
    paymentMethod: '',
    operationStartDate: '',
    memo: '',
  });

  // 成約済み案件一覧取得
  const { data: projects = [], isLoading: projectsLoading } = useQuery<
    { id: number; projectNo: string; customerName: string; partnerName: string }[]
  >({
    queryKey: ['projects-for-pipeline', selectedBusinessId],
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: '500' });
      if (selectedBusinessId) params.set('businessId', String(selectedBusinessId));
      const res = await fetch(`/api/v1/projects?${params}`);
      if (!res.ok) throw new Error('案件取得に失敗しました');
      const json = await res.json();
      return json.data.map((p: Record<string, unknown>) => ({
        id: p.id,
        projectNo: p.projectNo,
        customerName: (p.customer as Record<string, unknown> | null)?.customerName ?? '-',
        partnerName: (p.partner as Record<string, unknown> | null)?.partnerName ?? '-',
      }));
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/accounting-pipelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: parseInt(form.projectId, 10),
          revenueType: form.revenueType,
          unitPrice: parseFloat(form.unitPrice),
          quantity: parseInt(form.quantity, 10),
          billingCycle: form.billingCycle || null,
          paymentMethod: form.paymentMethod || null,
          operationStartDate: form.operationStartDate || null,
          memo: form.memo || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || '作成に失敗しました');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ message: '会計パイプラインを作成しました', type: 'success' });
      router.push(`/accounting/${data.data.id}`);
    },
    onError: (error: Error) => {
      toast({ message: error.message, type: 'error' });
    },
  });

  if (projectsLoading) return <LoadingSpinner />;

  const totalAmount = (parseFloat(form.unitPrice) || 0) * (parseInt(form.quantity, 10) || 0);

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/accounting')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          戻る
        </Button>
        <h1 className="text-xl font-bold">会計パイプライン新規作成</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">基本情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 案件選択 */}
          <div>
            <Label>案件 *</Label>
            <Select value={form.projectId} onValueChange={(v) => setForm({ ...form, projectId: v })}>
              <SelectTrigger>
                <SelectValue placeholder="案件を選択してください" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.projectNo} - {p.customerName} ({p.partnerName})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 報酬タイプ */}
          <div>
            <Label>報酬タイプ *</Label>
            <Select
              value={form.revenueType}
              onValueChange={(v) => setForm({ ...form, revenueType: v as 'SHOT' | 'STOCK' })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SHOT">ショット（単発）</SelectItem>
                <SelectItem value="STOCK">ストック（継続）</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 単価・個数・合計 */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>単価 *</Label>
              <Input
                type="number"
                placeholder="例: 2400000"
                value={form.unitPrice}
                onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
              />
            </div>
            <div>
              <Label>個数 *</Label>
              <Input
                type="number"
                min={1}
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </div>
            <div>
              <Label>売上金額</Label>
              <div className="h-9 flex items-center text-lg font-bold">
                ¥{totalAmount.toLocaleString()}
              </div>
            </div>
          </div>

          {/* ストック用: 着金サイクル */}
          {form.revenueType === 'STOCK' && (
            <div>
              <Label>着金サイクル</Label>
              <Input
                placeholder="例: 毎月、隔月、月2回"
                value={form.billingCycle}
                onChange={(e) => setForm({ ...form, billingCycle: e.target.value })}
              />
            </div>
          )}

          {/* 支払い方法 */}
          <div>
            <Label>支払い方法</Label>
            <Input
              placeholder="例: 全額納品日"
              value={form.paymentMethod}
              onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
            />
          </div>

          {/* 運用開始日 */}
          <div>
            <Label>運用開始日</Label>
            <Input
              type="date"
              value={form.operationStartDate}
              onChange={(e) => setForm({ ...form, operationStartDate: e.target.value })}
            />
          </div>

          {/* 備考 */}
          <div>
            <Label>備考</Label>
            <Textarea
              placeholder="備考を入力"
              value={form.memo}
              onChange={(e) => setForm({ ...form, memo: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push('/accounting')}>
          キャンセル
        </Button>
        <Button
          onClick={() => createMutation.mutate()}
          disabled={!form.projectId || !form.unitPrice || createMutation.isPending}
        >
          {createMutation.isPending ? '作成中...' : '作成'}
        </Button>
      </div>
    </div>
  );
}
