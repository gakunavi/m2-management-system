'use client';

import { useState } from 'react';
import { Settings } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { MasterManageModal } from './master-manage-modal';
import { useMasterOptions } from '@/hooks/use-master-options';
import type { MasterSelectConfig } from '@/types/config';

interface MasterSelectFieldProps {
  id: string;
  value: unknown;
  onChange: (value: unknown) => void;
  config: MasterSelectConfig;
  disabled?: boolean;
  placeholder?: string;
}

export function MasterSelectField({
  id,
  value,
  onChange,
  config,
  disabled,
  placeholder,
}: MasterSelectFieldProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const { options } = useMasterOptions(config);

  const strValue = value != null ? String(value) : undefined;

  return (
    <>
      <div className="flex gap-2">
        <Select
          value={strValue || undefined}
          onValueChange={(v) => onChange(v ? Number(v) : null)}
          disabled={disabled}
        >
          <SelectTrigger id={id} className="flex-1">
            <SelectValue placeholder={placeholder ?? '選択してください'} />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!disabled && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={() => setModalOpen(true)}
            title={config.modalTitle}
          >
            <Settings className="h-4 w-4" />
          </Button>
        )}
      </div>

      <MasterManageModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        config={config}
      />
    </>
  );
}
