'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useMobileMenu } from '@/hooks/use-mobile-menu';
import { NotificationPopover } from '@/components/features/notification/notification-popover';
import { ReminderBell } from '@/components/features/reminder/reminder-bell';
import { Menu, User, LogOut, ChevronDown } from 'lucide-react';
import { FontSizeSelector } from '@/components/layout/font-size-selector';
import { headerQuickItems, userMenuItems } from '@/config/navigation';
import { cn } from '@/lib/utils';

export function Header() {
  const pathname = usePathname();
  const { user, isAdmin, signOut } = useAuth();
  const { toggle } = useMobileMenu();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // メニュー外クリックで閉じる
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [userMenuOpen]);

  // ページ遷移で閉じる
  useEffect(() => {
    setUserMenuOpen(false);
  }, [pathname]);

  const visibleMenuItems = userMenuItems.filter(
    (item) => !item.adminOnly || isAdmin,
  );

  return (
    <header className="flex h-14 lg:h-16 items-center justify-between lg:justify-end gap-2 lg:gap-4 border-b bg-white px-3 lg:px-6 shadow-sm">
      {/* モバイル: ハンバーガーメニュー */}
      <button
        onClick={toggle}
        className="lg:hidden flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted transition-colors"
        aria-label="メニューを開く"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* モバイル: クイックアクセス（アイコンのみ） */}
      <div className="flex lg:hidden items-center gap-1">
        {headerQuickItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-md transition-colors',
              pathname === item.href || pathname.startsWith(`${item.href}/`)
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            aria-label={item.label}
          >
            <item.icon className="h-4.5 w-4.5" />
          </Link>
        ))}
      </div>

      {/* 右側エリア */}
      <div className="flex items-center gap-1 lg:gap-2">
        {/* デスクトップ: クイックアクセス（ラベル付き） */}
        <div className="hidden lg:flex items-center gap-1 mr-2">
          {headerQuickItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                pathname === item.href || pathname.startsWith(`${item.href}/`)
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>

        {/* 区切り線（デスクトップのみ） */}
        <div className="hidden lg:block h-6 w-px bg-border" />

        {/* 通知系 */}
        <ReminderBell />
        <NotificationPopover />
        <div className="hidden lg:block">
          <FontSizeSelector />
        </div>

        {/* ユーザーメニュー */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className={cn(
              'flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors',
              userMenuOpen ? 'bg-muted' : 'hover:bg-muted',
            )}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <User className="h-4 w-4" />
            </div>
            <span className="hidden sm:inline text-sm font-medium text-foreground max-w-[120px] truncate">
              {user?.name}
            </span>
            <ChevronDown className={cn(
              'hidden sm:block h-3.5 w-3.5 text-muted-foreground transition-transform',
              userMenuOpen && 'rotate-180',
            )} />
          </button>

          {/* ドロップダウンメニュー */}
          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-56 rounded-lg border bg-popover shadow-lg z-50 py-1">
              {/* ユーザー情報 */}
              <div className="px-3 py-2.5 border-b">
                <p className="text-sm font-medium truncate">{user?.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>

              {/* フォントサイズ（モバイルのみ） */}
              <div className="lg:hidden px-3 py-2 border-b">
                <p className="text-xs text-muted-foreground mb-1.5">文字サイズ</p>
                <FontSizeSelector />
              </div>

              {/* メニュー項目 */}
              <div className="py-1">
                {visibleMenuItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 text-sm transition-colors',
                      pathname === item.href || pathname.startsWith(`${item.href}/`)
                        ? 'bg-accent text-accent-foreground'
                        : 'text-foreground hover:bg-accent',
                    )}
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <item.icon className="h-4 w-4 text-muted-foreground" />
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>

              {/* ログアウト */}
              <div className="border-t py-1">
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    signOut();
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-accent transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  <span>ログアウト</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
