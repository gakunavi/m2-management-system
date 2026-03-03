'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2 } from 'lucide-react';
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
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/hooks/use-toast';
import { useBusiness } from '@/hooks/use-business';
import {
  BankAccountFormModal,
  type BankAccountRecord,
  type BankAccountFormData,
} from './bank-account-form-modal';

// ============================================
// Props
// ============================================

interface Props {
  entityId: number;
  /** API ベースエンドポイント（例: '/partners/123/bank-accounts'） */
  apiEndpoint: string;
  /** React Query のキャッシュキー（例: 'partner-bank-accounts'） */
  queryKey: string;
  /** ヘッダーに追加するアクション（例: CSVインポートボタン） */
  headerActions?: React.ReactNode;
}

// ============================================
// コンポーネント
// ============================================

export function BankAccountsTab({ entityId, apiEndpoint, queryKey, headerActions }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { businesses } = useBusiness();

  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccountRecord | null>(null);
  const [deletingAccountId, setDeletingAccountId] = useState<number | null>(null);

  // 口座一覧取得
  const { data: accounts = [], isLoading } = useQuery<BankAccountRecord[]>({
    queryKey: [queryKey, entityId],
    queryFn: async () => {
      const res = await fetch(`/api/v1${apiEndpoint}`);
      if (!res.ok) throw new Error('口座情報の取得に失敗しました');
      const json = await res.json();
      return json.data;
    },
  });

  // 口座追加
  const createMutation = useMutation({
    mutationFn: async (data: BankAccountFormData) => {
      const res = await fetch(`/api/v1${apiEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message ?? '口座情報の追加に失敗しました');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey, entityId] });
      toast({ message: '口座情報を追加しました', type: 'success' });
      setShowForm(false);
    },
    onError: (err: Error) => {
      toast({ message: err.message, type: 'error' });
    },
  });

  // 口座更新
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: BankAccountFormData }) => {
      const res = await fetch(`/api/v1${apiEndpoint}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message ?? '口座情報の更新に失敗しました');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey, entityId] });
      toast({ message: '口座情報を更新しました', type: 'success' });
      setEditingAccount(null);
      setShowForm(false);
    },
    onError: (err: Error) => {
      toast({ message: err.message, type: 'error' });
    },
  });

  // 口座削除
  const deleteMutation = useMutation({
    mutationFn: async (accountId: number) => {
      const res = await fetch(`/api/v1${apiEndpoint}/${accountId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('口座情報の削除に失敗しました');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey, entityId] });
      toast({ message: '口座情報を削除しました', type: 'success' });
      setDeletingAccountId(null);
    },
    onError: (err: Error) => {
      toast({ message: err.message, type: 'error' });
      setDeletingAccountId(null);
    },
  });

  const handleFormSubmit = async (data: BankAccountFormData) => {
    if (editingAccount) {
      await updateMutation.mutateAsync({ id: editingAccount.id, data });
    } else {
      await createMutation.mutateAsync(data);
    }
  };

  const handleEdit = (account: BankAccountRecord) => {
    setEditingAccount(account);
    setShowForm(true);
  };

  const handleCloseForm = (open: boolean) => {
    if (!open) {
      setShowForm(false);
      setEditingAccount(null);
    } else {
      setShowForm(true);
    }
  };

  const getBusinessLabel = (account: BankAccountRecord): React.ReactNode => {
    if (account.businessId === null) {
      return <Badge variant="secondary" className="text-xs">デフォルト</Badge>;
    }
    return (
      <span className="text-sm">
        {account.businessName ?? `事業ID: ${account.businessId}`}
      </span>
    );
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {accounts.length} 件の口座情報
        </p>
        <div className="flex items-center gap-2">
          {headerActions}
          <Button
            size="sm"
            onClick={() => {
              setEditingAccount(null);
              setShowForm(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            口座情報を追加
          </Button>
        </div>
      </div>

      {/* 口座テーブル */}
      {accounts.length === 0 ? (
        <EmptyState
          title="口座情報がありません"
          description="「口座情報を追加」ボタンから振込先口座を登録してください。"
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">対象事業</TableHead>
                <TableHead>金融機関</TableHead>
                <TableHead>支店名</TableHead>
                <TableHead className="w-[80px]">種別</TableHead>
                <TableHead>口座番号</TableHead>
                <TableHead>名義人（カナ）</TableHead>
                <TableHead className="w-[100px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell>{getBusinessLabel(account)}</TableCell>
                  <TableCell className="text-sm font-medium">{account.bankName}</TableCell>
                  <TableCell className="text-sm">{account.branchName}</TableCell>
                  <TableCell className="text-sm">{account.accountType}</TableCell>
                  <TableCell className="text-sm font-mono">{account.accountNumber}</TableCell>
                  <TableCell className="text-sm">{account.accountHolder}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleEdit(account)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeletingAccountId(account.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 口座フォームモーダル */}
      <BankAccountFormModal
        open={showForm}
        onOpenChange={handleCloseForm}
        account={editingAccount}
        availableBusinesses={businesses}
        existingAccounts={accounts}
        onSubmit={handleFormSubmit}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      {/* 削除確認モーダル */}
      <ConfirmModal
        open={deletingAccountId !== null}
        onOpenChange={(open) => !open && setDeletingAccountId(null)}
        title="口座情報を削除しますか？"
        description="この操作は元に戻せません。登録されている口座情報が削除されます。"
        confirmLabel="削除する"
        variant="destructive"
        onConfirm={() => {
          if (deletingAccountId !== null) {
            deleteMutation.mutate(deletingAccountId);
          }
        }}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
