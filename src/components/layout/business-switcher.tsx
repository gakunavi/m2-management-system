'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBusiness } from '@/hooks/use-business';
import { useAuth } from '@/hooks/use-auth';
import { Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** 全体表示用の特殊値（Radix Select は空文字を value に使えないため） */
const ALL_VALUE = '__all__';

interface BusinessSwitcherProps {
  variant?: 'default' | 'sidebar';
}

export function BusinessSwitcher({ variant = 'default' }: BusinessSwitcherProps) {
  const { selectedBusinessId, businesses, switchBusiness, isLoading } = useBusiness();
  const { isPartner } = useAuth();

  if (isLoading || businesses.length === 0) {
    return null;
  }

  const allLabel = isPartner ? 'すべて' : 'グループ全体';
  const isSidebar = variant === 'sidebar';

  return (
    <Select
      value={selectedBusinessId?.toString() ?? ALL_VALUE}
      onValueChange={(value) => {
        switchBusiness(value === ALL_VALUE ? null : Number(value));
      }}
    >
      <SelectTrigger
        className={cn(
          'w-full',
          isSidebar && 'border-white/20 bg-white/5 text-white hover:bg-white/10 focus:ring-white/30 [&>svg]:text-white/50',
        )}
      >
        <div className="flex items-center gap-2">
          <Building2 className={cn('h-4 w-4', isSidebar ? 'text-white/50' : 'text-muted-foreground')} />
          <SelectValue placeholder="事業を選択" />
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_VALUE}>{allLabel}</SelectItem>
        <SelectSeparator />
        {businesses.map((business) => (
          <SelectItem key={business.id} value={business.id.toString()}>
            {business.businessName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
