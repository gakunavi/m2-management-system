'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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

// ============================================
// 型定義
// ============================================

export interface BankAccountFormData {
  businessId: number | null;
  bankName: string;
  branchName: string;
  accountType: string;
  accountNumber: string;
  accountHolder: string;
}

export interface BankAccountRecord {
  id: number;
  businessId: number | null;
  businessName?: string | null;
  bankName: string;
  branchName: string;
  accountType: string;
  accountNumber: string;
  accountHolder: string;
}

export interface BusinessOption {
  id: number;
  businessName: string;
  businessCode: string;
}

// ============================================
// Props
// ============================================

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: BankAccountRecord | null;
  availableBusinesses: BusinessOption[];
  existingAccounts: BankAccountRecord[];
  onSubmit: (data: BankAccountFormData) => Promise<void>;
  isLoading?: boolean;
}

// ============================================
// 定数
// ============================================

const ACCOUNT_TYPES = ['普通', '当座'] as const;
const DEFAULT_BUSINESS_VALUE = '__default__';

// ============================================
// フォームの初期値
// ============================================

function getInitialValues(account?: BankAccountRecord | null): BankAccountFormData {
  if (account) {
    return {
      businessId: account.businessId,
      bankName: account.bankName,
      branchName: account.branchName,
      accountType: account.accountType,
      accountNumber: account.accountNumber,
      accountHolder: account.accountHolder,
    };
  }
  return {
    businessId: null,
    bankName: '',
    branchName: '',
    accountType: '普通',
    accountNumber: '',
    accountHolder: '',
  };
}

// ============================================
// コンポーネント
// ============================================

export function BankAccountFormModal({
  open,
  onOpenChange,
  account,
  availableBusinesses,
  existingAccounts,
  onSubmit,
  isLoading,
}: Props) {
  const isEdit = !!account;

  const [formData, setFormData] = useState<BankAccountFormData>(getInitialValues(account));
  const [errors, setErrors] = useState<Partial<Record<keyof BankAccountFormData, string>>>({});

  useEffect(() => {
    if (open) {
      setFormData(getInitialValues(account));
      setErrors({});
    }
  }, [open, account]);

  const set = <K extends keyof BankAccountFormData>(key: K, value: BankAccountFormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const usedBusinessIds = existingAccounts
    .filter((a) => !isEdit || a.id !== account?.id)
    .map((a) => a.businessId);

  const isBusinessDisabled = (businessId: number | null) => {
    return usedBusinessIds.includes(businessId);
  };

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof BankAccountFormData, string>> = {};

    if (!formData.bankName.trim()) {
      newErrors.bankName = '金融機関名は必須です';
    }
    if (!formData.branchName.trim()) {
      newErrors.branchName = '支店名は必須です';
    }
    if (!formData.accountNumber.trim()) {
      newErrors.accountNumber = '口座番号は必須です';
    }
    if (!formData.accountHolder.trim()) {
      newErrors.accountHolder = '名義人は必須です';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit(formData);
  };

  const businessSelectValue =
    formData.businessId === null ? DEFAULT_BUSINESS_VALUE : String(formData.businessId);

  const handleBusinessChange = (value: string) => {
    if (value === DEFAULT_BUSINESS_VALUE) {
      set('businessId', null);
    } else {
      set('businessId', Number(value));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? '口座情報を編集' : '口座情報を追加'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 対象事業 */}
          <div>
            <Label htmlFor="businessId">対象事業</Label>
            <Select value={businessSelectValue} onValueChange={handleBusinessChange}>
              <SelectTrigger id="businessId" className="mt-1">
                <SelectValue placeholder="事業を選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  value={DEFAULT_BUSINESS_VALUE}
                  disabled={isBusinessDisabled(null)}
                >
                  デフォルト（全事業共通）
                  {isBusinessDisabled(null) && ' ※登録済み'}
                </SelectItem>
                {availableBusinesses.map((b) => (
                  <SelectItem
                    key={b.id}
                    value={String(b.id)}
                    disabled={isBusinessDisabled(b.id)}
                  >
                    {b.businessName}
                    {isBusinessDisabled(b.id) && ' ※登録済み'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              デフォルトは全事業共通の振込先です。事業ごとに異なる口座を登録する場合は事業を選択してください。
            </p>
          </div>

          {/* 金融機関名 */}
          <div>
            <Label htmlFor="bankName">
              金融機関名 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="bankName"
              value={formData.bankName}
              onChange={(e) => set('bankName', e.target.value)}
              placeholder="例: ○○銀行"
              className="mt-1"
            />
            {errors.bankName && (
              <p className="text-sm text-destructive mt-1">{errors.bankName}</p>
            )}
          </div>

          {/* 支店名 */}
          <div>
            <Label htmlFor="branchName">
              支店名 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="branchName"
              value={formData.branchName}
              onChange={(e) => set('branchName', e.target.value)}
              placeholder="例: 新宿支店"
              className="mt-1"
            />
            {errors.branchName && (
              <p className="text-sm text-destructive mt-1">{errors.branchName}</p>
            )}
          </div>

          {/* 口座種別 */}
          <div>
            <Label htmlFor="accountType">口座種別</Label>
            <Select value={formData.accountType} onValueChange={(v) => set('accountType', v)}>
              <SelectTrigger id="accountType" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 口座番号 */}
          <div>
            <Label htmlFor="accountNumber">
              口座番号 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="accountNumber"
              value={formData.accountNumber}
              onChange={(e) => set('accountNumber', e.target.value)}
              placeholder="例: 1234567"
              className="mt-1"
            />
            {errors.accountNumber && (
              <p className="text-sm text-destructive mt-1">{errors.accountNumber}</p>
            )}
          </div>

          {/* 名義人（カナ） */}
          <div>
            <Label htmlFor="accountHolder">
              名義人（カナ） <span className="text-destructive">*</span>
            </Label>
            <Input
              id="accountHolder"
              value={formData.accountHolder}
              onChange={(e) => set('accountHolder', e.target.value)}
              placeholder="例: カブシキガイシャ〇〇"
              className="mt-1"
            />
            {errors.accountHolder && (
              <p className="text-sm text-destructive mt-1">{errors.accountHolder}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
