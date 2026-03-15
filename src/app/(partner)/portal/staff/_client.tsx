'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, RefreshCw, UserCheck, UserX, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ErrorDisplay } from '@/components/ui/error-display';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { ApiClientError } from '@/lib/api-client';

// ============================================
// 型定義
// ============================================

interface StaffItem {
  id: number;
  userEmail: string;
  userName: string;
  userRole: string;
  userRoleLabel: string;
  userPasswordPlain: string | null;
  userIsActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface StaffListResponse {
  data: StaffItem[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

// ============================================
// コンポーネント
// ============================================

export function StaffListClient() {
  const router = useRouter();
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isPartnerAdmin = hasRole('partner_admin');

  const [search, setSearch] = useState('');
  const [isActiveFilter, setIsActiveFilter] = useState('true');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<StaffItem | null>(null);

  const queryKey = ['partner-staff', { search, isActiveFilter, page }];

  const { data, isLoading, isError, refetch } = useQuery<StaffListResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '25',
        ...(search ? { search } : {}),
        ...(isActiveFilter ? { isActive: isActiveFilter } : {}),
      });
      const res = await fetch(`/api/v1/partner-staff?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? 'エラーが発生しました');
      return json;
    },
    enabled: isPartnerAdmin,
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await fetch(`/api/v1/partner-staff/${userId}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const json = await res.json();
        throw new ApiClientError(
          json.error?.message ?? '無効化に失敗しました',
          json.error?.code ?? 'ERROR',
          res.status,
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partner-staff'] });
      toast({ type: 'success', message: 'スタッフを無効化しました' });
      setDeleteTarget(null);
    },
    onError: (err) => {
      toast({
        type: 'error',
        message: err instanceof ApiClientError ? err.message : '無効化に失敗しました',
      });
      setDeleteTarget(null);
    },
  });

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const handleActiveChange = useCallback((value: string) => {
    setIsActiveFilter(value === 'all' ? '' : value);
    setPage(1);
  }, []);

  // partner_admin以外はアクセス禁止（すべてのHooksの後に配置）
  if (!isPartnerAdmin) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        このページへのアクセス権限がありません。
      </div>
    );
  }

  const staffList = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="スタッフ管理"
        breadcrumbs={[{ label: 'スタッフ管理' }]}
        actions={
          <Button onClick={() => router.push('/portal/staff/new')}>
            <Plus className="h-4 w-4 mr-2" />
            新規スタッフ
          </Button>
        }
      />

      {/* フィルターバー */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="名前・メールで検索"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select onValueChange={handleActiveChange} value={isActiveFilter || 'all'}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">有効のみ</SelectItem>
            <SelectItem value="false">無効のみ</SelectItem>
            <SelectItem value="all">すべて</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="ghost" size="icon" onClick={() => refetch()} aria-label="更新">
          <RefreshCw className="h-4 w-4" />
        </Button>

        {meta && (
          <span className="text-sm text-muted-foreground ml-auto">
            {meta.total} 件
          </span>
        )}
      </div>

      {/* テーブル */}
      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <ErrorDisplay message="スタッフ一覧の取得に失敗しました" onRetry={() => refetch()} />
      ) : staffList.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          スタッフが見つかりません
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden max-h-[calc(100vh-300px)] overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted sticky top-0 z-20">
              <tr>
                <th className="text-left px-4 py-3 font-medium">名前</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">メールアドレス</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">パスワード</th>
                <th className="text-left px-4 py-3 font-medium">状態</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">作成日</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {staffList.map((staff) => (
                <tr key={staff.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium">{staff.userName}</p>
                      <p className="text-xs text-muted-foreground sm:hidden">{staff.userEmail}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                    {staff.userEmail}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    {staff.userPasswordPlain ? (
                      <code className="text-xs font-mono bg-muted px-2 py-1 rounded">
                        {staff.userPasswordPlain}
                      </code>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {staff.userIsActive ? (
                      <span className="flex items-center gap-1 text-green-600 text-xs">
                        <UserCheck className="h-3.5 w-3.5" /> 有効
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-muted-foreground text-xs">
                        <UserX className="h-3.5 w-3.5" /> 無効
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs hidden sm:table-cell">
                    {new Date(staff.createdAt).toLocaleDateString('ja-JP')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => router.push(`/portal/staff/${staff.id}/edit`)}
                        aria-label="編集"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(staff)}
                        aria-label="無効化"
                        disabled={!staff.userIsActive}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ページネーション */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            前へ
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {meta.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            次へ
          </Button>
        </div>
      )}

      {/* 無効化確認モーダル */}
      <ConfirmModal
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="スタッフを無効化"
        description={`「${deleteTarget?.userName}」を無効化します。このスタッフはログインできなくなります。`}
        confirmLabel="無効化"
        variant="destructive"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
