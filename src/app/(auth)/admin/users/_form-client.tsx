'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { ApiClientError } from '@/lib/api-client';

// ============================================
// 型・定数
// ============================================

interface Business {
  id: number;
  businessCode: string;
  businessName: string;
}

interface Partner {
  id: number;
  partnerName: string;
  partnerCode: string;
}

interface UserData {
  id: number;
  userName: string;
  userEmail: string;
  userRole: string;
  userPartnerId: number | null;
  userPasswordPlain: string | null;
  userIsActive: boolean;
  businesses: { id: number; businessCode: string; businessName: string }[];
}

const ROLE_OPTIONS = [
  { value: 'admin', label: '管理者' },
  { value: 'staff', label: 'スタッフ' },
  { value: 'partner_admin', label: '代理店管理者' },
  { value: 'partner_staff', label: '代理店スタッフ' },
];

const PARTNER_ROLES = ['partner_admin', 'partner_staff'];

// ============================================
// バリデーション
// ============================================

const createSchema = z.object({
  userName: z.string().min(1, '名前は必須です').max(100),
  userEmail: z.string().email('有効なメールアドレスを入力してください').max(255),
  userPassword: z.string().min(8, 'パスワードは8文字以上で入力してください').max(100),
  userRole: z.enum(['admin', 'staff', 'partner_admin', 'partner_staff']),
  userPartnerId: z.number().optional().nullable(),
  businessIds: z.array(z.number()),
});

const editSchema = z.object({
  userName: z.string().min(1, '名前は必須です').max(100),
  userEmail: z.string().email('有効なメールアドレスを入力してください').max(255),
  userPassword: z.string().min(8, 'パスワードは8文字以上').max(100).optional().or(z.literal('')),
  userRole: z.enum(['admin', 'staff', 'partner_admin', 'partner_staff']),
  userPartnerId: z.number().optional().nullable(),
  userIsActive: z.boolean(),
  businessIds: z.array(z.number()),
});

type FormErrors = Partial<Record<string, string>>;

// ============================================
// コンポーネント
// ============================================

interface Props {
  mode: 'new' | 'edit';
  userId?: string;
}

export function UserFormClient({ mode, userId }: Props) {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { toast } = useToast();

  // 既存ユーザー取得（編集時）
  const { data: userData, isLoading: isLoadingUser } = useQuery<{ data: UserData }>({
    queryKey: ['admin-user', userId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/users/${userId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? 'エラー');
      return json;
    },
    enabled: mode === 'edit' && !!userId && isAdmin,
  });

  // 初期値: 編集時はAPIデータ、新規時はデフォルト
  const initial = userData?.data;

  // フォームステート
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userRole, setUserRole] = useState<string>('staff');
  const [userPartnerId, setUserPartnerId] = useState<number | null>(null);
  const [userIsActive, setUserIsActive] = useState(true);
  const [selectedBusinessIds, setSelectedBusinessIds] = useState<number[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [initialized, setInitialized] = useState(mode === 'new');

  useEffect(() => {
    if (initial && !initialized) {
      setUserName(initial.userName);
      setUserEmail(initial.userEmail);
      setUserRole(initial.userRole);
      setUserPartnerId(initial.userPartnerId);
      setUserIsActive(initial.userIsActive);
      setSelectedBusinessIds(initial.businesses.map((b) => b.id));
      setInitialized(true);
    }
  }, [initial, initialized]);

  // 事業一覧取得
  const { data: businessesData } = useQuery<{ data: Business[] }>({
    queryKey: ['businesses-all'],
    queryFn: async () => {
      const res = await fetch('/api/v1/businesses?pageSize=100&isActive=true');
      const json = await res.json();
      if (!res.ok) throw new Error('事業一覧の取得に失敗しました');
      return json;
    },
    enabled: isAdmin,
  });

  // 代理店一覧取得
  const { data: partnersData } = useQuery<{ data: Partner[] }>({
    queryKey: ['partners-all'],
    queryFn: async () => {
      const res = await fetch('/api/v1/partners?pageSize=200&isActive=true');
      const json = await res.json();
      if (!res.ok) throw new Error('代理店一覧の取得に失敗しました');
      return json;
    },
    enabled: isAdmin && PARTNER_ROLES.includes(userRole),
  });

  const businesses = businessesData?.data ?? [];
  const partners = partnersData?.data ?? [];

  // 保存ミューテーション
  const mutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const url = mode === 'new' ? '/api/v1/users' : `/api/v1/users/${userId}`;
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
      toast({
        type: 'success',
        message: mode === 'new' ? 'ユーザーを作成しました' : 'ユーザー情報を更新しました',
      });
      router.push('/admin/users');
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
      userRole: userRole as 'admin' | 'staff' | 'partner_admin' | 'partner_staff',
      userPartnerId: PARTNER_ROLES.includes(userRole) ? userPartnerId : null,
      businessIds: selectedBusinessIds,
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

  const toggleBusiness = (id: number) => {
    setSelectedBusinessIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  // admin以外はアクセス禁止（すべてのHooksの後に配置）
  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        このページへのアクセス権限がありません。
      </div>
    );
  }

  if (mode === 'edit' && (isLoadingUser || !initialized)) return <LoadingSpinner />;

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-2xl">
      <PageHeader
        title={mode === 'new' ? '新規ユーザー作成' : 'ユーザー編集'}
        breadcrumbs={[
          { label: 'ユーザー管理', href: '/admin/users' },
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
            <Input
              id="userPassword"
              type="password"
              value={userPassword}
              onChange={(e) => setUserPassword(e.target.value)}
              placeholder={mode === 'new' ? '8文字以上' : '変更しない場合は空欄'}
              className={errors.userPassword ? 'border-destructive' : ''}
            />
            {errors.userPassword && (
              <p className="text-xs text-destructive">{errors.userPassword}</p>
            )}
            {mode === 'edit' && initial?.userPasswordPlain && (
              <div className="mt-1 p-2 bg-muted rounded-md">
                <p className="text-xs text-muted-foreground mb-1">現在のパスワード:</p>
                <code className="text-sm font-mono">{initial.userPasswordPlain}</code>
              </div>
            )}
          </div>
        </div>

        {/* ロール・権限 */}
        <div className="rounded-lg border p-4 sm:p-6 space-y-4">
          <h2 className="font-semibold text-base">ロール・権限</h2>

          <div className="space-y-2">
            <Label htmlFor="userRole">
              ロール <span className="text-destructive">*</span>
            </Label>
            <Select
              value={userRole}
              onValueChange={(v) => {
                setUserRole(v);
                if (!PARTNER_ROLES.includes(v)) setUserPartnerId(null);
              }}
            >
              <SelectTrigger id="userRole" className={errors.userRole ? 'border-destructive' : ''}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.userRole && <p className="text-xs text-destructive">{errors.userRole}</p>}
          </div>

          {/* 代理店選択（代理店ロール時のみ） */}
          {PARTNER_ROLES.includes(userRole) && (
            <div className="space-y-2">
              <Label htmlFor="userPartnerId">
                所属代理店 <span className="text-destructive">*</span>
              </Label>
              <Select
                value={userPartnerId ? String(userPartnerId) : ''}
                onValueChange={(v) => setUserPartnerId(v ? Number(v) : null)}
              >
                <SelectTrigger
                  id="userPartnerId"
                  className={errors.userPartnerId ? 'border-destructive' : ''}
                >
                  <SelectValue placeholder="代理店を選択" />
                </SelectTrigger>
                <SelectContent>
                  {partners.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.partnerName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.userPartnerId && (
                <p className="text-xs text-destructive">{errors.userPartnerId}</p>
              )}
            </div>
          )}

          {/* 有効/無効（編集時のみ） */}
          {mode === 'edit' && (
            <div className="flex items-center gap-2">
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

        {/* 事業アサイン */}
        <div className="rounded-lg border p-4 sm:p-6 space-y-4">
          <h2 className="font-semibold text-base">事業アサイン</h2>
          <p className="text-sm text-muted-foreground">
            アサインされた事業のデータにアクセスできます。管理者はすべての事業にアクセスできます。
          </p>

          {businesses.length === 0 ? (
            <p className="text-sm text-muted-foreground">事業が登録されていません</p>
          ) : (
            <div className="space-y-2">
              {businesses.map((b) => (
                <div key={b.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`business-${b.id}`}
                    checked={selectedBusinessIds.includes(b.id)}
                    onCheckedChange={() => toggleBusiness(b.id)}
                  />
                  <Label htmlFor={`business-${b.id}`} className="cursor-pointer font-normal">
                    {b.businessName}
                    <span className="text-muted-foreground ml-2 text-xs">{b.businessCode}</span>
                  </Label>
                </div>
              ))}
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
            onClick={() => router.push('/admin/users')}
            disabled={mutation.isPending}
          >
            キャンセル
          </Button>
        </div>
      </form>
    </div>
  );
}
