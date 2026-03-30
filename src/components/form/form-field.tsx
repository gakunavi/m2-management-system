'use client';

import { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DuplicateWarning } from './duplicate-warning';
import { MasterSelectField } from './master-select-field';
import { ParentPartnerSelectField } from './parent-partner-select-field';
import { FileUploadField } from './file-upload-field';
import { EntitySelectField } from './entity-select-field';
import type { FormFieldDef } from '@/types/config';
import type { DuplicateCheckResult } from '@/hooks/use-duplicate-check';

interface FormFieldProps {
  field: FormFieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  duplicateWarning?: DuplicateCheckResult;
  formData?: Record<string, unknown>;
  /** 他のフィールドを更新するコールバック（file-upload のキーフィールド用） */
  onSetField?: (key: string, value: unknown) => void;
}

export function FormField({ field, value, onChange, error, duplicateWarning, formData, onSetField }: FormFieldProps) {
  const id = `field-${field.key}`;

  return (
    <div
      className={cn(
        'space-y-2',
        field.colSpan === 2 && 'col-span-2',
        field.colSpan === 3 && 'col-span-3',
      )}
    >
      <Label htmlFor={id} className={cn(error && 'text-destructive')}>
        {field.label}
        {field.required && <span className="text-destructive ml-1">*</span>}
      </Label>

      {renderInput(field, id, value, onChange, formData, onSetField)}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {duplicateWarning && (
        <DuplicateWarning
          candidates={duplicateWarning.candidates}
          isChecking={duplicateWarning.isChecking}
          entityLabel={field.label}
          isExactComboMatch={duplicateWarning.isExactComboMatch}
        />
      )}
    </div>
  );
}

function renderInput(
  field: FormFieldDef,
  id: string,
  value: unknown,
  onChange: (value: unknown) => void,
  formData?: Record<string, unknown>,
  onSetField?: (key: string, value: unknown) => void,
) {
  const strValue = (value as string) ?? '';

  switch (field.type) {
    case 'text':
    case 'email':
    case 'phone':
    case 'url':
      if (field.addressAutoFill && onSetField) {
        return (
          <PostalCodeField
            id={id}
            value={strValue}
            onChange={onChange}
            placeholder={field.placeholder}
            disabled={field.disabled === true}
            targetKey={field.addressAutoFill.targetKey}
            onSetField={onSetField}
          />
        );
      }
      return (
        <Input
          id={id}
          type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : field.type === 'url' ? 'url' : 'text'}
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={field.disabled === true}
        />
      );

    case 'number':
      return (
        <Input
          id={id}
          type="number"
          value={value != null ? String(value) : ''}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          placeholder={field.placeholder}
          disabled={field.disabled === true}
        />
      );

    case 'textarea':
      return (
        <Textarea
          id={id}
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={field.disabled === true}
          rows={4}
        />
      );

    case 'select':
      return (
        <Select
          value={strValue || undefined}
          onValueChange={(v) => onChange(v)}
          disabled={field.disabled === true}
        >
          <SelectTrigger id={id}>
            <SelectValue placeholder={field.placeholder ?? '選択してください'} />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'date':
      return (
        <Input
          id={id}
          type="date"
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={field.disabled === true}
        />
      );

    case 'month':
      return (
        <MonthPicker
          id={id}
          value={strValue}
          onChange={onChange}
          disabled={field.disabled === true}
        />
      );

    case 'checkbox':
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            id={id}
            checked={!!value}
            onCheckedChange={(checked) => onChange(checked)}
            disabled={field.disabled === true}
          />
        </div>
      );

    case 'readonly':
      return (
        <div className="rounded-md border bg-muted px-3 py-2 text-sm">
          {strValue || '-'}
        </div>
      );

    case 'master-select':
      return (
        <MasterSelectField
          id={id}
          value={value}
          onChange={onChange}
          config={field.masterSelect!}
          disabled={field.disabled}
          placeholder={field.placeholder}
        />
      );

    case 'partner-select':
      return (
        <ParentPartnerSelectField
          id={id}
          value={value as number | null}
          onChange={onChange}
          config={field.partnerSelect!}
          formData={formData}
          disabled={field.disabled}
          placeholder={field.placeholder}
          onSetField={onSetField}
        />
      );

    case 'file-upload':
      return (
        <FileUploadField
          value={value as string | null}
          onChange={onChange}
          config={field.fileUpload!}
          formData={formData}
          id={id}
          onSetField={onSetField}
        />
      );

    case 'entity-select':
      return (
        <EntitySelectField
          id={id}
          value={value as number | null}
          onChange={(id) => onChange(id)}
          config={field.entitySelect!}
          disabled={field.disabled}
        />
      );

    default:
      return (
        <Input
          id={id}
          type="text"
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

/** Safari 対応の年月選択コンポーネント（YYYY-MM 形式） */
function MonthPicker({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 14 }, (_, i) => currentYear - 5 + i);

  const [year, month] = value ? value.split('-') : [String(currentYear), ''];

  const handleYearChange = (y: string) => {
    if (y && month) {
      onChange(`${y}-${month}`);
    } else if (y && !month) {
      onChange(`${y}-01`);
    } else {
      onChange('');
    }
  };

  const handleMonthChange = (m: string) => {
    if (year && m) {
      onChange(`${year}-${m}`);
    } else if (!year && m) {
      onChange(`${currentYear}-${m}`);
    } else {
      onChange('');
    }
  };

  return (
    <div className="flex gap-2">
      <Select value={year || undefined} onValueChange={handleYearChange} disabled={disabled}>
        <SelectTrigger id={id} className="w-[120px]">
          <SelectValue placeholder="年" />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}年
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={month || undefined} onValueChange={handleMonthChange} disabled={disabled}>
        <SelectTrigger className="w-[100px]">
          <SelectValue placeholder="月" />
        </SelectTrigger>
        <SelectContent>
          {Array.from({ length: 12 }, (_, i) => {
            const m = String(i + 1).padStart(2, '0');
            return (
              <SelectItem key={m} value={m}>
                {i + 1}月
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

/** 郵便番号から住所を自動検索するフィールド */
function PostalCodeField({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  targetKey,
  onSetField,
}: {
  id: string;
  value: string;
  onChange: (value: unknown) => void;
  placeholder?: string;
  disabled?: boolean;
  targetKey: string;
  onSetField: (key: string, value: unknown) => void;
}) {
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    const cleaned = value.replace(/[-\s\u3000]/g, '');
    if (!/^\d{7}$/.test(cleaned)) {
      setSearchError('7桁の郵便番号を入力してください');
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    try {
      const res = await fetch(
        `https://zipcloud.ibsnet.co.jp/api/search?zipcode=${cleaned}`,
      );
      const data = await res.json();

      if (data.status !== 200 || !data.results || data.results.length === 0) {
        setSearchError('該当する住所が見つかりません');
        return;
      }

      const result = data.results[0];
      const address = `${result.address1}${result.address2}${result.address3}`;
      onSetField(targetKey, address);
    } catch {
      setSearchError('住所検索に失敗しました');
    } finally {
      setIsSearching(false);
    }
  }, [value, targetKey, onSetField]);

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Input
          id={id}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setSearchError(null);
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSearch}
          disabled={disabled || isSearching || !value}
          className="shrink-0 h-9"
        >
          {isSearching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          <span className="ml-1.5">住所検索</span>
        </Button>
      </div>
      {searchError && (
        <p className="text-xs text-destructive">{searchError}</p>
      )}
    </div>
  );
}
