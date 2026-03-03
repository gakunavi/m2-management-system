'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/hooks/use-toast';
import { useBusiness } from '@/hooks/use-business';

// ============================================
// 型定義
// ============================================

interface BusinessLink {
  id: number;
  customerId: number;
  businessId: number;
  businessName: string;
  businessCode: string;
  linkStatus: string;
  linkCustomData: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// Props
// ============================================

interface Props {
  entityId: number;
}

// ============================================
// コンポーネント
// ============================================

export function CustomerBusinessLinksTab({ entityId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { businesses } = useBusiness();

  const [selectedBusinessId, setSelectedBusinessId] = useState<string>('');
  const [deletingLinkId, setDeletingLinkId] = useState<number | null>(null);

  // 事業リンク一覧取得
  const { data: links = [], isLoading } = useQuery<BusinessLink[]>({
    queryKey: ['customer-business-links', entityId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/customers/${entityId}/business-links`);
      if (!res.ok) throw new Error('事業リンクの取得に失敗しました');
      const json = await res.json();
      return json.data;
    },
  });

  // 紐付け済みの事業IDセット
  const linkedBusinessIds = new Set(links.map((l) => l.businessId));

  // 未紐付けの事業のみ選択肢に表示
  const availableBusinesses = businesses.filter((b) => !linkedBusinessIds.has(b.id));

  // 事業リンク追加
  const createMutation = useMutation({
    mutationFn: async (businessId: number) => {
      const res = await fetch(`/api/v1/customers/${entityId}/business-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId, linkStatus: 'active' }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message ?? '事業の紐付けに失敗しました');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-business-links', entityId] });
      toast({ message: '事業を紐付けました', type: 'success' });
      setSelectedBusinessId('');
    },
    onError: (err: Error) => {
      toast({ message: err.message, type: 'error' });
    },
  });

  // ステータス変更
  const updateStatusMutation = useMutation({
    mutationFn: async ({ linkId, status }: { linkId: number; status: string }) => {
      const res = await fetch(`/api/v1/customers/${entityId}/business-links/${linkId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkStatus: status }),
      });
      if (!res.ok) throw new Error('ステータスの更新に失敗しました');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-business-links', entityId] });
    },
    onError: (err: Error) => {
      toast({ message: err.message, type: 'error' });
    },
  });

  // 事業リンク解除
  const deleteMutation = useMutation({
    mutationFn: async (linkId: number) => {
      const res = await fetch(`/api/v1/customers/${entityId}/business-links/${linkId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('事業リンクの解除に失敗しました');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-business-links', entityId] });
      toast({ message: '事業リンクを解除しました', type: 'success' });
      setDeletingLinkId(null);
    },
    onError: (err: Error) => {
      toast({ message: err.message, type: 'error' });
      setDeletingLinkId(null);
    },
  });

  const handleAddLink = () => {
    if (!selectedBusinessId) return;
    createMutation.mutate(parseInt(selectedBusinessId, 10));
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {/* 事業紐付け追加エリア */}
      {availableBusinesses.length > 0 && (
        <div className="flex items-center gap-2">
          <Select value={selectedBusinessId} onValueChange={setSelectedBusinessId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="事業を選択..." />
            </SelectTrigger>
            <SelectContent>
              {availableBusinesses.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.businessName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={handleAddLink}
            disabled={!selectedBusinessId || createMutation.isPending}
          >
            <Plus className="mr-1 h-4 w-4" />
            {createMutation.isPending ? '追加中...' : '事業を紐付け'}
          </Button>
        </div>
      )}

      {/* 事業リンクテーブル */}
      {links.length === 0 ? (
        <EmptyState
          title="紐付いている事業がありません"
          description="上のセレクトボックスから事業を選択して紐付けてください。"
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>事業名</TableHead>
                <TableHead>事業コード</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead>紐付け日</TableHead>
                <TableHead className="w-[80px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.map((link) => (
                <TableRow key={link.id}>
                  <TableCell className="font-medium">{link.businessName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{link.businessCode}</TableCell>
                  <TableCell>
                    <Select
                      value={link.linkStatus}
                      onValueChange={(val) =>
                        updateStatusMutation.mutate({ linkId: link.id, status: val })
                      }
                    >
                      <SelectTrigger className="w-[110px] h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">
                          <Badge variant="default" className="text-xs">有効</Badge>
                        </SelectItem>
                        <SelectItem value="inactive">
                          <Badge variant="secondary" className="text-xs">無効</Badge>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(link.createdAt).toLocaleDateString('ja-JP')}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setDeletingLinkId(link.id)}
                      aria-label="削除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 解除確認モーダル */}
      <ConfirmModal
        open={deletingLinkId !== null}
        onOpenChange={(open) => !open && setDeletingLinkId(null)}
        title="事業リンクを解除しますか？"
        description="この操作は元に戻せません。"
        confirmLabel="解除する"
        variant="destructive"
        onConfirm={() => {
          if (deletingLinkId !== null) {
            deleteMutation.mutate(deletingLinkId);
          }
        }}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
