'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { Eye, EyeOff, Copy, Check } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { ApiClientError } from '@/lib/api-client';

// ============================================
// 型・定数
// ============================================

interface StaffData {
  id: number;
  userName: string;
  userEmail: string;
  userPasswordPlain: string | null;
  userIsActive: boolean;
}

// ============================================
// バリデーション
// ============================================

const createSchema = z.object({
  userName: z.string().min(1, '名前は必須です').max(100),
  userEmail: z.string().email('有効なメールアドレスを入力してください').max(255),
  userPassword: z.string().min(8, 'パスワードは8文字以上で入力してください').max(100),
});

const editSchema = z.object({
  userName: z.string().min(1, '名前は必須です').max(100),
  userEmail: z.string().email('有効なメールアドレスを入力してください').max(255),
  userPassword: z.string().min(8, 'パスワードは8文字以上').max(100).optional().or(z.literal('')),
  userIsActive: z.boolean(),
});

type FormErrors = Partial<Record<string, string>>;

// ============================================
// コンポーネント
// ============================================

interface Props {
  mode: 'new' | 'edit';
  staffId?: string;
}

export function StaffFormClient({ mode, staffId }: Props) {
  const router = useRouter();
  const { hasRole } = useAuth();
  const { toast } = useToast();

  const isPartnerAdmin = hasRole('partner_admin');

  // 既存スタッフ取得（編集時）
  const { data: staffData, isLoading: isLoadingStaff } = useQuery<{ data: StaffData }>({
    queryKey: ['partner-staff-detail', staffId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/partner-staff/${staffId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? 'エラー');
      return json;
    },
    enabled: mode === 'edit' && !!staffId && isPartnerAdmin,
  });

  const initial = staffData?.data;

  // フォームステート
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userIsActive, setUserIsActive] = useState(true);
  const [errors, setErrors] = useState<FormErrors>({});
  const [initialized, setInitialized] = useState(mode === 'new');
  const [showPassword, setShowPassword] = useState(false);

  // 作成完了後のパスワード確認ダイアログ
  const [createdCredentials, setCreatedCredentials] = useState<{
    userName: string;
    userEmail: string;
    password: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (initial && !initialized) {
      setUserName(initial.userName);
      setUserEmail(initial.userEmail);
      setUserIsActive(initial.userIsActive);
      setInitialized(true);
    }
  }, [initial, initialized]);

  const handleCopyPassword = useCallback(async () => {
    if (!createdCredentials) return;
    try {
      await navigator.clipboard.writeText(createdCredentials.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ type: 'info', message: 'パスワードを手動でコピーしてください' });
    }
  }, [createdCredentials, toast]);

  const handleCloseDialog = useCallback(() => {
    setCreatedCredentials(null);
    router.push('/portal/staff');
  }, [router]);

  // 保存ミューテーション
  const mutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const url = mode === 'new' ? '/api/v1/partner-staff' : `/api/v1/partner-staff/${staffId}`;
      const method = mode === 'new' ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new ApiClientError(
          json.error?.message ?? '保存に失敗しました',
          json.error?.code ?? 'ERROR',
          res.status,
          json.error?.details,
        );
      }
      return json;
    },
    onSuccess: () => {
      if (mode === 'new') {
        // 新規作成時: パスワード確認ダイアログを表示（遷移はダイアログを閉じた後）
        setCreatedCredentials({
          userName,
          userEmail,
          password: userPassword,
        });
      } else {
        toast({
          type: 'success',
          message: userPassword
            ? 'スタッフ情報を更新しました（パスワードも変更済み）'
            : 'スタッフ情報を更新しました',
        });
        router.push('/portal/staff');
      }
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        if (err.details) {
          const fieldErrors: FormErrors = {};
          for (const d of err.details) {
            fieldErrors[d.field] = d.message;
          }
          setErrors(fieldErrors);
        }
        toast({ type: 'error', message: err.message });
      } else {
        toast({ type: 'error', message: '保存に失敗しました' });
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const raw = {
      userName,
      userEmail,
      ...(mode === 'new' ? { userPassword } : {}),
      ...(mode === 'edit' ? { userPassword: userPassword || undefined, userIsActive } : {}),
    };

    const schema = mode === 'new' ? createSchema : editSchema;
    const result = schema.safeParse(raw);

    if (!result.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.');
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    mutation.mutate(result.data as Record<string, unknown>);
  };

  // partner_admin以外はアクセス禁止（すべてのHooksの後に配置）
  if (!isPartnerAdmin) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        このページへのアクセス権限がありません。
      </div>
    );
  }

  if (mode === 'edit' && (isLoadingStaff || !initialized)) return <LoadingSpinner />;

  return (
    <>
      <div className="space-y-6 p-4 sm:p-6 max-w-2xl">
        <PageHeader
          title={mode === 'new' ? '新規スタッフ作成' : 'スタッフ編集'}
          breadcrumbs={[
            { label: 'スタッフ管理', href: '/portal/staff' },
            { label: mode === 'new' ? '新規作成' : '編集' },
          ]}
        />

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 基本情報 */}
          <div className="rounded-lg border p-4 sm:p-6 space-y-4">
            <h2 className="font-semibold text-base">基本情報</h2>

            <div className="space-y-2">
              <Label htmlFor="userName">
                名前 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="userName"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="例: 山田 太郎"
                className={errors.userName ? 'border-destructive' : ''}
              />
              {errors.userName && <p className="text-xs text-destructive">{errors.userName}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="userEmail">
                メールアドレス <span className="text-destructive">*</span>
              </Label>
              <Input
                id="userEmail"
                type="email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                placeholder="例: taro.yamada@example.com"
                className={errors.userEmail ? 'border-destructive' : ''}
              />
              {errors.userEmail && <p className="text-xs text-destructive">{errors.userEmail}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="userPassword">
                パスワード
                {mode === 'new' && <span className="text-destructive"> *</span>}
                {mode === 'edit' && (
                  <span className="text-muted-foreground text-xs ml-2">
                    （変更する場合のみ入力）
                  </span>
                )}
              </Label>
              <div className="relative">
                <Input
                  id="userPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={userPassword}
                  onChange={(e) => setUserPassword(e.target.value)}
                  placeholder={mode === 'new' ? '8文字以上' : '変更しない場合は空欄'}
                  className={errors.userPassword ? 'border-destructive pr-10' : 'pr-10'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.userPassword && (
                <p className="text-xs text-destructive">{errors.userPassword}</p>
              )}
              {mode === 'edit' && initial?.userPasswordPlain && (
                <div className="mt-1 p-2 bg-muted rounded-md">
                  <p className="text-xs text-muted-foreground mb-1">現在のパスワード:</p>
                  <code className="text-sm font-mono">{initial.userPasswordPlain}</code>
                </div>
              )}
              {mode === 'edit' && (
                <p className="text-xs text-muted-foreground">
                  新しいパスワードを入力すると変更されます。変更しない場合は空欄のままにしてください。
                </p>
              )}
            </div>

            {/* 有効/無効（編集時のみ） */}
            {mode === 'edit' && (
              <div className="flex items-center gap-2 pt-2">
                <Checkbox
                  id="userIsActive"
                  checked={userIsActive}
                  onCheckedChange={(v) => setUserIsActive(!!v)}
                />
                <Label htmlFor="userIsActive" className="cursor-pointer">
                  アカウント有効
                </Label>
              </div>
            )}
          </div>

          {/* フッター */}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? '保存中...' : mode === 'new' ? '作成' : '保存'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/portal/staff')}
              disabled={mutation.isPending}
            >
              キャンセル
            </Button>
          </div>
        </form>
      </div>

      {/* 作成完了後のパスワード確認ダイアログ */}
      <Dialog open={!!createdCredentials} onOpenChange={(open) => { if (!open) handleCloseDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>スタッフを作成しました</DialogTitle>
            <DialogDescription>
              以下のログイン情報をスタッフにお伝えください。パスワードはスタッフ一覧・編集画面でも確認できます。
            </DialogDescription>
          </DialogHeader>

          {createdCredentials && (
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">名前</p>
                <p className="text-sm">{createdCredentials.userName}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">メールアドレス（ログインID）</p>
                <p className="text-sm font-mono bg-muted px-3 py-2 rounded-md">{createdCredentials.userEmail}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">パスワード</p>
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-sm font-mono bg-muted px-3 py-2 rounded-md">
                    {createdCredentials.password}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0 h-9 w-9"
                    onClick={handleCopyPassword}
                    aria-label="パスワードをコピー"
                  >
                    {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={handleCloseDialog}>
              閉じてスタッフ一覧へ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
