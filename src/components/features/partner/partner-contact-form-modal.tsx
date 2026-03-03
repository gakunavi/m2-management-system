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
import { Checkbox } from '@/components/ui/checkbox';
import { BusinessCardUpload } from '@/components/ui/business-card-upload';

// ============================================
// 型定義
// ============================================

export interface ContactFormData {
  contactName: string;
  contactDepartment: string | null;
  contactPosition: string | null;
  contactIsRepresentative: boolean;
  contactPhone: string | null;
  contactFax: string | null;
  contactEmail: string | null;
  contactBusinessCardFrontUrl: string | null;
  contactBusinessCardBackUrl: string | null;
  contactIsPrimary: boolean;
  businessIds: number[];
  _frontKey?: string | null;
  _backKey?: string | null;
}

export interface ContactRecord {
  id: number;
  partnerId: number;
  contactName: string;
  contactDepartment: string | null;
  contactPosition: string | null;
  contactIsRepresentative: boolean;
  contactPhone: string | null;
  contactFax: string | null;
  contactEmail: string | null;
  contactBusinessCardFrontUrl: string | null;
  contactBusinessCardBackUrl: string | null;
  contactIsPrimary: boolean;
  contactSortOrder: number;
  businesses: { id: number; businessId: number; businessName: string; businessCode: string }[];
  contactBusinessCardFrontKey?: string | null;
  contactBusinessCardBackKey?: string | null;
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
  contact?: ContactRecord | null;
  availableBusinesses: BusinessOption[];
  onSubmit: (data: ContactFormData) => Promise<void>;
  isLoading?: boolean;
}

// ============================================
// フォームの初期値
// ============================================

function getInitialValues(contact?: ContactRecord | null): ContactFormData {
  if (contact) {
    return {
      contactName: contact.contactName,
      contactDepartment: contact.contactDepartment,
      contactPosition: contact.contactPosition,
      contactIsRepresentative: contact.contactIsRepresentative,
      contactPhone: contact.contactPhone,
      contactFax: contact.contactFax,
      contactEmail: contact.contactEmail,
      contactBusinessCardFrontUrl: contact.contactBusinessCardFrontUrl,
      contactBusinessCardBackUrl: contact.contactBusinessCardBackUrl,
      contactIsPrimary: contact.contactIsPrimary,
      businessIds: contact.businesses.map((b) => b.businessId),
      _frontKey: contact.contactBusinessCardFrontKey ?? null,
      _backKey: contact.contactBusinessCardBackKey ?? null,
    };
  }
  return {
    contactName: '',
    contactDepartment: null,
    contactPosition: null,
    contactIsRepresentative: false,
    contactPhone: null,
    contactFax: null,
    contactEmail: null,
    contactBusinessCardFrontUrl: null,
    contactBusinessCardBackUrl: null,
    contactIsPrimary: false,
    businessIds: [],
    _frontKey: null,
    _backKey: null,
  };
}

// ============================================
// コンポーネント
// ============================================

export function PartnerContactFormModal({
  open,
  onOpenChange,
  contact,
  availableBusinesses,
  onSubmit,
  isLoading,
}: Props) {
  const isEdit = !!contact;

  const [formData, setFormData] = useState<ContactFormData>(getInitialValues(contact));
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    if (open) {
      setFormData(getInitialValues(contact));
      setNameError('');
    }
  }, [open, contact]);

  const set = <K extends keyof ContactFormData>(key: K, value: ContactFormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleBusinessToggle = (businessId: number) => {
    const current = formData.businessIds;
    if (current.includes(businessId)) {
      set('businessIds', current.filter((id) => id !== businessId));
    } else {
      set('businessIds', [...current, businessId]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.contactName.trim()) {
      setNameError('担当者名は必須です');
      return;
    }
    setNameError('');
    await onSubmit(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? '担当者を編集' : '担当者を追加'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 担当者名 */}
          <div>
            <Label htmlFor="contactName">
              担当者名 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="contactName"
              value={formData.contactName}
              onChange={(e) => set('contactName', e.target.value)}
              placeholder="例: 山田太郎"
              className="mt-1"
            />
            {nameError && (
              <p className="text-sm text-destructive mt-1">{nameError}</p>
            )}
          </div>

          {/* 部署・役職 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="contactDepartment">部署</Label>
              <Input
                id="contactDepartment"
                value={formData.contactDepartment ?? ''}
                onChange={(e) => set('contactDepartment', e.target.value || null)}
                placeholder="例: 営業部"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="contactPosition">役職</Label>
              <Input
                id="contactPosition"
                value={formData.contactPosition ?? ''}
                onChange={(e) => set('contactPosition', e.target.value || null)}
                placeholder="例: 部長"
                className="mt-1"
              />
            </div>
          </div>

          {/* フラグ */}
          <div className="flex flex-wrap gap-3 sm:gap-6">
            <div className="flex items-center gap-2">
              <Checkbox
                id="contactIsRepresentative"
                checked={formData.contactIsRepresentative}
                onCheckedChange={(checked) => set('contactIsRepresentative', !!checked)}
              />
              <Label htmlFor="contactIsRepresentative" className="cursor-pointer">代表者</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="contactIsPrimary"
                checked={formData.contactIsPrimary}
                onCheckedChange={(checked) => set('contactIsPrimary', !!checked)}
              />
              <Label htmlFor="contactIsPrimary" className="cursor-pointer">主担当</Label>
            </div>
          </div>

          {/* 連絡先 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="contactPhone">電話番号</Label>
              <Input
                id="contactPhone"
                type="tel"
                value={formData.contactPhone ?? ''}
                onChange={(e) => set('contactPhone', e.target.value || null)}
                placeholder="03-0000-0000"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="contactFax">FAX</Label>
              <Input
                id="contactFax"
                type="tel"
                value={formData.contactFax ?? ''}
                onChange={(e) => set('contactFax', e.target.value || null)}
                placeholder="03-0000-0000"
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="contactEmail">メールアドレス</Label>
            <Input
              id="contactEmail"
              type="email"
              value={formData.contactEmail ?? ''}
              onChange={(e) => set('contactEmail', e.target.value || null)}
              placeholder="yamada@example.co.jp"
              className="mt-1"
            />
          </div>

          {/* 名刺アップロード */}
          <div>
            <Label className="mb-2 block">名刺</Label>
            <BusinessCardUpload
              frontUrl={formData.contactBusinessCardFrontUrl}
              backUrl={formData.contactBusinessCardBackUrl}
              frontKey={formData._frontKey}
              backKey={formData._backKey}
              onFrontChange={(url, key) => {
                set('contactBusinessCardFrontUrl', url);
                set('_frontKey', key);
              }}
              onBackChange={(url, key) => {
                set('contactBusinessCardBackUrl', url);
                set('_backKey', key);
              }}
            />
          </div>

          {/* 担当事業 */}
          {availableBusinesses.length > 0 && (
            <div>
              <Label>担当事業</Label>
              <div className="mt-2 space-y-2">
                {availableBusinesses.map((b) => (
                  <div key={b.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`business-${b.id}`}
                      checked={formData.businessIds.includes(b.id)}
                      onCheckedChange={() => handleBusinessToggle(b.id)}
                    />
                    <Label htmlFor={`business-${b.id}`} className="cursor-pointer font-normal">
                      {b.businessName}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}

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
