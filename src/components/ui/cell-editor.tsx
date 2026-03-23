'use client';

import { useRef, useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CellEditConfig } from '@/types/config';

interface CellEditorProps {
  config: CellEditConfig;
  value: unknown;
  onCommit: (value: unknown) => void;
  onCancel: () => void;
}

export function CellEditor({ config, value, onCommit, onCancel }: CellEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    textareaRef.current?.focus();
    textareaRef.current?.select();
  }, []);

  const strValue = (value as string) ?? '';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
    if (e.key === 'Enter' && config.type !== 'textarea') {
      e.preventDefault();
      const v = (e.currentTarget as HTMLInputElement).value;
      if (config.type === 'number') {
        onCommit(v !== '' ? Number(v) : null);
      } else {
        onCommit(v);
      }
    }
  };

  if (config.type === 'checkbox') {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <Checkbox
          checked={!!value}
          onCheckedChange={(checked) => onCommit(!!checked)}
        />
      </div>
    );
  }

  if (config.type === 'select') {
    return (
      <Select
        value={strValue}
        onValueChange={(v) => onCommit(v)}
        defaultOpen
      >
        <SelectTrigger className="h-7 border-0 rounded-none focus:ring-1 focus:ring-ring text-sm">
          <SelectValue placeholder={config.placeholder ?? '選択...'} />
        </SelectTrigger>
        <SelectContent>
          {config.options?.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (config.type === 'master-select') {
    return (
      <MasterSelectCellEditor
        config={config}
        value={value}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    );
  }

  if (config.type === 'textarea') {
    return (
      <div className="flex flex-col w-full">
        <Textarea
          ref={textareaRef}
          defaultValue={strValue}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              onCancel();
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onCommit((e.currentTarget as HTMLTextAreaElement).value);
            }
          }}
          placeholder={config.placeholder}
          className="h-auto min-h-[60px] border-0 rounded-none focus-visible:ring-1 focus-visible:ring-ring text-sm p-1 resize-none"
          rows={3}
        />
        <div className="px-1 py-0.5 bg-muted/50 border-t text-[10px] text-muted-foreground">
          Ctrl+Enter で保存
        </div>
      </div>
    );
  }

  if (config.type === 'month') {
    return (
      <MonthCellEditor value={value} onCommit={onCommit} onCancel={onCancel} />
    );
  }

  const inputType = (() => {
    switch (config.type) {
      case 'email': return 'email';
      case 'phone': return 'tel';
      case 'number': return 'number';
      case 'date': return 'date';
      case 'url': return 'url';
      default: return 'text';
    }
  })();

  return (
    <Input
      ref={inputRef}
      type={inputType}
      defaultValue={config.type === 'number' ? (value != null ? String(value) : '') : strValue}
      onBlur={(e) => {
        const v = e.target.value;
        if (config.type === 'number') {
          onCommit(v !== '' ? Number(v) : null);
        } else {
          onCommit(v);
        }
      }}
      onKeyDown={handleKeyDown}
      placeholder={config.placeholder}
      className="h-7 border-0 rounded-none focus-visible:ring-1 focus-visible:ring-ring text-sm px-1"
    />
  );
}

// ============================================
// マスタ選択セルエディタ（API から選択肢を取得）
// ============================================

function MasterSelectCellEditor(props: {
  config: CellEditConfig;
  value: unknown;
  onCommit: (value: unknown) => void;
  onCancel: () => void;
}) {
  const { config, value, onCommit } = props;
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    if (!config.optionsEndpoint) return;
    fetch(`/api/v1${config.optionsEndpoint}`)
      .then((r) => r.json())
      .then((json) => {
        const items = json.data ?? [];
        setOptions(
          items.map((item: Record<string, unknown>) => ({
            value: String(item.id),
            label: String(item[config.labelField ?? 'name'] ?? ''),
          }))
        );
      })
      .catch(() => {});
  }, [config.optionsEndpoint, config.labelField]);

  // value は number | null。Select は string で扱う（null は '__none__' に変換）
  const strValue = value != null ? String(value) : '__none__';

  return (
    <Select
      value={strValue}
      onValueChange={(v) => onCommit(v === '__none__' ? null : Number(v))}
      defaultOpen
    >
      <SelectTrigger className="h-7 border-0 rounded-none focus:ring-1 focus:ring-ring text-sm">
        <SelectValue placeholder={config.placeholder ?? '選択...'} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">（未設定）</SelectItem>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ============================================
// 月選択セルエディタ（Safari 対応）
// ============================================

function MonthCellEditor({
  value,
  onCommit,
}: {
  value: unknown;
  onCommit: (value: unknown) => void;
  onCancel: () => void;
}) {
  const strValue = (value as string) ?? '';
  const [initYear, initMonth] = strValue ? strValue.split('-') : ['', ''];
  const [year, setYear] = useState(initYear);
  const [month, setMonth] = useState(initMonth);
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 14 }, (_, i) => currentYear - 5 + i);

  const handleYearChange = (y: string) => {
    setYear(y);
    const m = month || '01';
    setMonth(m);
    onCommit(`${y}-${m}`);
  };

  const handleMonthChange = (m: string) => {
    setMonth(m);
    const y = year || String(currentYear);
    setYear(y);
    onCommit(`${y}-${m}`);
  };

  // 外クリックによるキャンセルは EditableCell 側の pointerdown 検知で処理

  return (
    <div className="flex gap-1">
      <Select
        value={year || undefined}
        onValueChange={handleYearChange}
      >
        <SelectTrigger className="h-7 w-[80px] border-0 rounded-none focus:ring-1 focus:ring-ring text-sm px-1">
          <SelectValue placeholder="年" />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>{y}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={month || undefined}
        onValueChange={handleMonthChange}
      >
        <SelectTrigger className="h-7 w-[60px] border-0 rounded-none focus:ring-1 focus:ring-ring text-sm px-1">
          <SelectValue placeholder="月" />
        </SelectTrigger>
        <SelectContent>
          {Array.from({ length: 12 }, (_, i) => {
            const m = String(i + 1).padStart(2, '0');
            return <SelectItem key={m} value={m}>{i + 1}月</SelectItem>;
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
