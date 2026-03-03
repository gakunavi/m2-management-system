'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, RefreshCw, UserCheck, UserX, Pencil, Trash2, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ErrorDisplay } from '@/components/ui/error-display';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { ApiClientError } from '@/lib/api-client';

// ============================================
// 型定義
// ============================================

interface UserBusiness {
  id: number;
  businessCode: string;
  businessName: string;
}

interface UserItem {
  id: number;
  userEmail: string;
  userName: string;
  userRole: string;
  userRoleLabel: string;
  userPartnerId: number | null;
  userPasswordPlain: string | null;
  userIsActive: boolean;
  createdAt: string;
  updatedAt: string;
  partner: { id: number; partnerName: string } | null;
  businesses: UserBusiness[];
}

interface UserListResponse {
  data: UserItem[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

const ROLE_OPTIONS = [
  { value: '', label: 'すべてのロール' },
  { value: 'admin', label: '管理者' },
  { value: 'staff', label: 'スタッフ' },
  { value: 'partner_admin', label: '代理店管理者' },
  { value: 'partner_staff', label: '代理店スタッフ' },
];

const ROLE_BADGE_VARIANTS: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  admin: 'default',
  staff: 'secondary',
  partner_admin: 'outline',
  partner_staff: 'outline',
};

type SortField = 'userName' | 'userEmail' | 'userRole' | 'userIsActive' | 'createdAt';
type SortDirection = 'asc' | 'desc';

// ============================================
// コンポーネント
// ============================================

export function UserListClient() {
  const router = useRouter();
  const { user: currentUser, isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [isActiveFilter, setIsActiveFilter] = useState('true');
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<SortField>('userName');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [deleteTarget, setDeleteTarget] = useState<UserItem | null>(null);

  const queryKey = ['admin-users', { search, roleFilter, isActiveFilter, page, sortField, sortDirection }];

  const { data, isLoading, isError, refetch } = useQuery<UserListResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '25',
        ...(search ? { search } : {}),
        ...(roleFilter ? { userRole: roleFilter } : {}),
        isActive: isActiveFilter,
        sortBy: sortField,
        sortOrder: sortDirection,
      });
      const res = await fetch(`/api/v1/users?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? 'エラーが発生しました');
      return json;
    },
    enabled: isAdmin,
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await fetch(`/api/v1/users/${userId}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const json = await res.json();
        throw new ApiClientError(
          json.error?.message ?? '削除に失敗しました',
          json.error?.code ?? 'ERROR',
          res.status,
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ type: 'success', message: 'ユーザーを無効化しました' });
      setDeleteTarget(null);
    },
    onError: (err) => {
      toast({
        type: 'error',
        message: err instanceof ApiClientError ? err.message : '削除に失敗しました',
      });
      setDeleteTarget(null);
    },
  });

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const handleRoleChange = useCallback((value: string) => {
    setRoleFilter(value === 'all' ? '' : value);
    setPage(1);
  }, []);

  const handleActiveChange = useCallback((value: string) => {
    setIsActiveFilter(value);
    setPage(1);
  }, []);

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setPage(1);
  }, [sortField]);

  // admin以外はアクセス禁止（すべてのHooksの後に配置）
  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        このページへのアクセス権限がありません。
      </div>
    );
  }

  const users = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="ユーザー管理"
        breadcrumbs={[{ label: 'ユーザー管理' }]}
        actions={
          <Button onClick={() => router.push('/admin/users/new')}>
            <Plus className="h-4 w-4 mr-2" />
            新規ユーザー
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

        <Select onValueChange={handleRoleChange} value={roleFilter || 'all'}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="ロール" />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value || 'all'} value={opt.value || 'all'}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select onValueChange={(v) => handleActiveChange(v === 'all' ? '' : v)} value={isActiveFilter || 'all'}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">有効のみ</SelectItem>
            <SelectItem value="false">無効のみ</SelectItem>
            <SelectItem value="all">すべて</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="ghost" size="icon" onClick={() => refetch()} title="更新">
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
        <ErrorDisplay message="ユーザー一覧の取得に失敗しました" onRetry={() => refetch()} />
      ) : users.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          ユーザーが見つかりません
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <SortableTh field="userName" label="名前" currentField={sortField} direction={sortDirection} onSort={handleSort} />
                <SortableTh field="userEmail" label="メールアドレス" currentField={sortField} direction={sortDirection} onSort={handleSort} />
                <th className="text-left px-4 py-3 font-medium">パスワード</th>
                <SortableTh field="userRole" label="ロール" currentField={sortField} direction={sortDirection} onSort={handleSort} />
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">代理店</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">事業</th>
                <SortableTh field="userIsActive" label="状態" currentField={sortField} direction={sortDirection} onSort={handleSort} />
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{user.userName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{user.userEmail}</td>
                  <td className="px-4 py-3">
                    {user.userPasswordPlain ? (
                      <code className="text-xs font-mono bg-muted px-2 py-1 rounded">
                        {user.userPasswordPlain}
                      </code>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={ROLE_BADGE_VARIANTS[user.userRole] ?? 'outline'}>
                      {user.userRoleLabel}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                    {user.partner?.partnerName ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                    {user.businesses.length > 0
                      ? user.businesses.map((b) => b.businessName).join('、')
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {user.userIsActive ? (
                      <span className="flex items-center gap-1 text-green-600 text-xs">
                        <UserCheck className="h-3.5 w-3.5" /> 有効
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-muted-foreground text-xs">
                        <UserX className="h-3.5 w-3.5" /> 無効
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => router.push(`/admin/users/${user.id}`)}
                        title="編集"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {user.id !== currentUser?.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(user)}
                          title="無効化"
                          disabled={!user.userIsActive}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
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

      {/* 削除確認モーダル */}
      <ConfirmModal
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="ユーザーを無効化"
        description={`「${deleteTarget?.userName}」を無効化します。このユーザーはログインできなくなります。`}
        confirmLabel="無効化"
        variant="destructive"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

function SortableTh({
  field,
  label,
  currentField,
  direction,
  onSort,
}: {
  field: SortField;
  label: string;
  currentField: SortField;
  direction: SortDirection;
  onSort: (field: SortField) => void;
}) {
  const isActive = currentField === field;
  return (
    <th
      className="text-left px-4 py-3 font-medium cursor-pointer select-none hover:bg-muted/80 transition-colors"
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          direction === 'asc' ? (
            <ArrowUp className="h-3.5 w-3.5 text-foreground" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 text-foreground" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
        )}
      </span>
    </th>
  );
}
