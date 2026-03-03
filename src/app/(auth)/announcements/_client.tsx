'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, AlertTriangle, Megaphone, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// ============================================
// 型定義
// ============================================

interface AnnouncementData {
  id: number;
  businessId: number | null;
  title: string;
  content: string;
  priority: 'normal' | 'important' | 'urgent';
  targetScope: 'internal' | 'all';
  publishedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  author: { id: number; userName: string };
  business: { id: number; businessName: string } | null;
}

// ============================================
// ヘルパー
// ============================================

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function getStatus(a: AnnouncementData): { label: string; variant: 'default' | 'secondary' | 'outline' } {
  if (!a.publishedAt) return { label: '下書き', variant: 'secondary' };
  const now = new Date();
  if (a.expiresAt && new Date(a.expiresAt) < now) return { label: '期限切れ', variant: 'outline' };
  return { label: '公開中', variant: 'default' };
}

const priorityConfig = {
  urgent: { label: '緊急', className: 'bg-destructive/10 text-destructive border-destructive/30', icon: AlertTriangle },
  important: { label: '重要', className: 'bg-yellow-100 text-yellow-800 border-yellow-300', icon: Megaphone },
  normal: { label: '通常', className: 'bg-blue-50 text-blue-700 border-blue-200', icon: Info },
} as const;

// ============================================
// メインコンポーネント
// ============================================

export function AnnouncementListClient() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data, isLoading } = useQuery<{ data: AnnouncementData[] }>({
    queryKey: ['announcements', 'all'],
    queryFn: async () => {
      const res = await fetch('/api/v1/announcements?includeAll=true');
      if (!res.ok) throw new Error('取得に失敗しました');
      return res.json();
    },
  });

  const announcements = data?.data ?? [];

  const handleDelete = async () => {
    if (!deletingId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/v1/announcements/${deletingId}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error('削除に失敗しました');
      toast({ message: 'お知らせを削除しました', type: 'success' });
      setDeletingId(null);
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
    } catch {
      toast({ message: '削除に失敗しました', type: 'error' });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div>
      <PageHeader title="お知らせ管理" breadcrumbs={[{ label: 'お知らせ管理' }]} />

      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">
            {announcements.length} 件
          </p>
          <Link href="/announcements/new">
            <Button size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              新規作成
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : announcements.length === 0 ? (
          <EmptyState
            title="お知らせがありません"
            description="「新規作成」ボタンからお知らせを追加してください。"
          />
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>タイトル</TableHead>
                  <TableHead className="w-[80px]">優先度</TableHead>
                  <TableHead className="w-[80px]">対象</TableHead>
                  <TableHead className="w-[100px]">ステータス</TableHead>
                  <TableHead className="w-[100px]">事業</TableHead>
                  <TableHead className="w-[100px]">公開日</TableHead>
                  <TableHead className="w-[80px]">作成者</TableHead>
                  <TableHead className="w-[80px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {announcements.map((a) => {
                  const status = getStatus(a);
                  const priority = priorityConfig[a.priority];

                  return (
                    <TableRow key={a.id}>
                      <TableCell>
                        <Link
                          href={`/announcements/${a.id}`}
                          className="text-sm font-medium hover:underline"
                        >
                          {a.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-xs', priority.className)}>
                          {priority.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {a.targetScope === 'all' ? '全体' : '社内'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant} className="text-xs">
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {a.business?.businessName ?? '全社共通'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {a.publishedAt ? formatDate(a.publishedAt) : '-'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {a.author?.userName ?? '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Link href={`/announcements/${a.id}`}>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                              'h-7 w-7 text-muted-foreground',
                              'hover:text-destructive hover:bg-destructive/10',
                            )}
                            onClick={() => setDeletingId(a.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <ConfirmModal
        open={deletingId !== null}
        onOpenChange={(open) => { if (!open) setDeletingId(null); }}
        title="お知らせを削除しますか？"
        description="この操作は元に戻せません。"
        confirmLabel="削除する"
        variant="destructive"
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
    </div>
  );
}
