'use client';

import { useAuth } from '@/hooks/use-auth';
import { useMobileMenu } from '@/hooks/use-mobile-menu';
import { NotificationPopover } from '@/components/features/notification/notification-popover';
import { ReminderBell } from '@/components/features/reminder/reminder-bell';
import { Menu, User } from 'lucide-react';
import { FontSizeSelector } from '@/components/layout/font-size-selector';

export function Header() {
  const { user } = useAuth();
  const { toggle } = useMobileMenu();

  return (
    <header className="flex h-14 lg:h-16 items-center justify-between lg:justify-end gap-4 border-b bg-white px-4 lg:px-6 shadow-sm">
      {/* モバイル: ハンバーガーメニュー */}
      <button
        onClick={toggle}
        className="lg:hidden flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted transition-colors"
        aria-label="メニューを開く"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex items-center gap-2 lg:gap-4">
        <ReminderBell />
        <NotificationPopover />
        <FontSizeSelector />
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <User className="h-4 w-4" />
          </div>
          <span className="hidden sm:inline text-sm font-medium text-foreground">{user?.name}</span>
        </div>
      </div>
    </header>
  );
}
