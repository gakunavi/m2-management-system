'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';

interface PipelineData {
  id: number;
  projectId: number;
  businessId: number;
  revenueType: string;
  unitPrice: number;
  quantity: number;
  totalAmount: number;
  billingCycle: string | null;
  paymentMethod: string | null;
  operationStartDate: string | null;
  memo: string | null;
  version: number;
  project: {
    id: number;
    projectNo: string;
    projectSalesStatus: string;
    customerName: string | null;
    partnerName: string | null;
  } | null;
  business: { id: number; businessName: string } | null;
  entries: EntryData[];
}

interface EntryData {
  id: number;
  entryDate: string;
  amount: number;
  periodYear: number;
  periodMonth: number;
  entryStatus: string;
  entryMemo: string | null;
  version: number;
  distributionTotal: number;
  distributions: DistributionData[];
}

interface DistributionData {
  id: number;
  partnerId: number | null;
  partnerName: string | null;
  tier: number;
  tierLabel: string | null;
  rateType: string;
  commissionRate: number;
  commissionAmount: number;
  isManualOverride: boolean;
  paymentDueDate: string | null;
  paymentStatus: string;
}

export function AccountingPipelineDetailClient({ id }: { id: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedEntryId, setExpandedEntryId] = useState<number | null>(null);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [newEntry, setNewEntry] = useState({
    entryDate: new Date().toISOString().split('T')[0],
    amount: '',
    periodYear: new Date().getFullYear(),
    periodMonth: new Date().getMonth() + 1,
  });

  const { data: pipeline, isLoading } = useQuery<PipelineData>({
    queryKey: ['accounting-pipeline', id],
    queryFn: async () => {
      const res = await fetch(`/api/v1/accounting-pipelines/${id}`);
      if (!res.ok) throw new Error('取得に失敗しました');
      const json = await res.json();
      return json.data;
    },
  });

  const addEntryMutation = useMutation({
    mutationFn: async (data: { entryDate: string; amount: number; periodYear: number; periodMonth: number }) => {
      const res = await fetch(`/api/v1/accounting-pipelines/${id}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || '追加に失敗しました');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-pipeline', id] });
      setShowAddEntry(false);
      setNewEntry({
        entryDate: new Date().toISOString().split('T')[0],
        amount: '',
        periodYear: new Date().getFullYear(),
        periodMonth: new Date().getMonth() + 1,
      });
      toast({ message: '着金エントリを追加しました', type: 'success' });
    },
    onError: (error: Error) => {
      toast({ message: error.message, type: 'error' });
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: async (entryId: number) => {
      const res = await fetch(`/api/v1/accounting-pipelines/${id}/entries/${entryId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || '削除に失敗しました');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-pipeline', id] });
      toast({ message: '着金エントリを削除しました', type: 'success' });
    },
    onError: (error: Error) => {
      toast({ message: error.message, type: 'error' });
    },
  });

  const updateEntryStatusMutation = useMutation({
    mutationFn: async ({ entryId, entryStatus, version }: { entryId: number; entryStatus: string; version: number }) => {
      const res = await fetch(`/api/v1/accounting-pipelines/${id}/entries/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryStatus, version }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'ステータス変更に失敗しました');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-pipeline', id] });
      toast({ message: 'ステータスを変更しました', type: 'success' });
    },
    onError: (error: Error) => {
      toast({ message: error.message, type: 'error' });
    },
  });

  if (isLoading || !pipeline) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/accounting')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          戻る
        </Button>
        <h1 className="text-xl font-bold">会計パイプライン詳細</h1>
      </div>

      {/* 案件サマリー */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">案件情報</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">MO番号</span>
              <p className="font-medium">{pipeline.project?.projectNo ?? '-'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">顧客名</span>
              <p className="font-medium">{pipeline.project?.customerName ?? '-'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">代理店名</span>
              <p className="font-medium">{pipeline.project?.partnerName ?? '-'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">事業</span>
              <p className="font-medium">{pipeline.business?.businessName ?? '-'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">報酬タイプ</span>
              <p className="font-medium">
                <Badge variant={pipeline.revenueType === 'SHOT' ? 'secondary' : 'default'}>
                  {pipeline.revenueType === 'SHOT' ? 'ショット' : 'ストック'}
                </Badge>
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">売上金額</span>
              <p className="font-medium">¥{pipeline.totalAmount.toLocaleString()}</p>
            </div>
            <div>
              <span className="text-muted-foreground">着金サイクル</span>
              <p className="font-medium">{pipeline.billingCycle || '-'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">支払い方法</span>
              <p className="font-medium">{pipeline.paymentMethod || '-'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 着金エントリ一覧 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">着金エントリ</CardTitle>
            <Button size="sm" onClick={() => setShowAddEntry(true)}>
              <Plus className="h-4 w-4 mr-1" />
              着金追加
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>着金日</TableHead>
                <TableHead className="text-right">着金額</TableHead>
                <TableHead>対象年月</TableHead>
                <TableHead className="text-right">分配合計</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pipeline.entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    着金エントリがありません
                  </TableCell>
                </TableRow>
              ) : (
                pipeline.entries.map((entry) => (
                  <>
                    <TableRow
                      key={entry.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setExpandedEntryId(expandedEntryId === entry.id ? null : entry.id)}
                    >
                      <TableCell>{entry.entryDate}</TableCell>
                      <TableCell className="text-right font-medium">
                        ¥{entry.amount.toLocaleString()}
                      </TableCell>
                      <TableCell>{entry.periodYear}年{entry.periodMonth}月</TableCell>
                      <TableCell className="text-right">
                        ¥{entry.distributionTotal.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={entry.entryStatus === 'CONFIRMED' ? 'default' : 'secondary'}>
                          {entry.entryStatus === 'CONFIRMED' ? '確定' : '下書き'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {entry.entryStatus === 'DRAFT' ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateEntryStatusMutation.mutate({
                                    entryId: entry.id,
                                    entryStatus: 'CONFIRMED',
                                    version: entry.version,
                                  });
                                }}
                              >
                                確定
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm('このエントリを削除しますか？')) {
                                    deleteEntryMutation.mutate(entry.id);
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs h-7"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateEntryStatusMutation.mutate({
                                  entryId: entry.id,
                                  entryStatus: 'DRAFT',
                                  version: entry.version,
                                });
                              }}
                            >
                              差し戻し
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* 分配明細（展開時） */}
                    {expandedEntryId === entry.id && (
                      <TableRow key={`dist-${entry.id}`}>
                        <TableCell colSpan={6} className="bg-muted/30 p-4">
                          <div className="text-sm font-medium mb-2">手数料分配</div>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[60px]">階層</TableHead>
                                <TableHead>分配先</TableHead>
                                <TableHead>直/間</TableHead>
                                <TableHead className="text-right">料率</TableHead>
                                <TableHead className="text-right">金額</TableHead>
                                <TableHead>支払状況</TableHead>
                                <TableHead>手動</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {entry.distributions.map((d) => (
                                <TableRow key={d.id}>
                                  <TableCell>{d.tier}</TableCell>
                                  <TableCell>{d.tierLabel || d.partnerName || '（自社）'}</TableCell>
                                  <TableCell>
                                    <Badge variant={d.rateType === 'DIRECT' ? 'default' : 'outline'} className="text-xs">
                                      {d.rateType === 'DIRECT' ? '直' : '間'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right">{d.commissionRate}%</TableCell>
                                  <TableCell className="text-right font-medium">
                                    ¥{d.commissionAmount.toLocaleString()}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={d.paymentStatus === 'PAID' ? 'default' : 'secondary'} className="text-xs">
                                      {d.paymentStatus === 'PAID' ? '支払済' : '未払い'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>{d.isManualOverride ? '✓' : ''}</TableCell>
                                </TableRow>
                              ))}
                              {entry.distributions.length > 0 && (
                                <TableRow className="font-medium">
                                  <TableCell colSpan={3}>合計</TableCell>
                                  <TableCell className="text-right">
                                    {entry.distributions.reduce((sum, d) => sum + d.commissionRate, 0).toFixed(2)}%
                                  </TableCell>
                                  <TableCell className="text-right">
                                    ¥{entry.distributionTotal.toLocaleString()}
                                  </TableCell>
                                  <TableCell colSpan={2} />
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 着金追加ダイアログ */}
      <Dialog open={showAddEntry} onOpenChange={setShowAddEntry}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>着金エントリ追加</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>着金日</Label>
              <Input
                type="date"
                value={newEntry.entryDate}
                onChange={(e) => setNewEntry({ ...newEntry, entryDate: e.target.value })}
              />
            </div>
            <div>
              <Label>着金額</Label>
              <Input
                type="number"
                placeholder="例: 2400000"
                value={newEntry.amount}
                onChange={(e) => setNewEntry({ ...newEntry, amount: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>対象年</Label>
                <Input
                  type="number"
                  value={newEntry.periodYear}
                  onChange={(e) => setNewEntry({ ...newEntry, periodYear: parseInt(e.target.value, 10) })}
                />
              </div>
              <div>
                <Label>対象月</Label>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={newEntry.periodMonth}
                  onChange={(e) => setNewEntry({ ...newEntry, periodMonth: parseInt(e.target.value, 10) })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddEntry(false)}>キャンセル</Button>
            <Button
              onClick={() => {
                if (!newEntry.amount) return;
                addEntryMutation.mutate({
                  entryDate: newEntry.entryDate,
                  amount: parseFloat(newEntry.amount),
                  periodYear: newEntry.periodYear,
                  periodMonth: newEntry.periodMonth,
                });
              }}
              disabled={addEntryMutation.isPending}
            >
              {addEntryMutation.isPending ? '追加中...' : '追加（分配自動計算）'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
