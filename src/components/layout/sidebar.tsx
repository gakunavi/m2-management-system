'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LogOut, ChevronLeft, ChevronRight, X, User } from 'lucide-react';
import { mainNavItems, type NavItem } from '@/config/navigation';
import { BusinessSwitcher } from './business-switcher';
import { useAuth } from '@/hooks/use-auth';
import { useBusiness } from '@/hooks/use-business';
import { useMobileMenu } from '@/hooks/use-mobile-menu';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';

const STORAGE_KEY = 'sidebar-collapsed';

interface SidebarProps {
  /** カスタムナビ項目（省略時は mainNavItems を使用） */
  navItems?: NavItem[];
  /** 事業スイッチャーを表示するか（デフォルト: true） */
  showBusinessSwitcher?: boolean;
  /** タイトル（デフォルト: M²管理システム） */
  title?: string;
}

export function Sidebar({ navItems, showBusinessSwitcher = true, title = 'M²管理システム' }: SidebarProps) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { hasSelectedBusiness } = useBusiness();
  const { isOpen: mobileOpen, close: closeMobile } = useMobileMenu();
  const [collapsed, setCollapsed] = useState(false);
  const items = navItems ?? mainNavItems;

  // ページロード時に保存済みの状態を復元
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'true') setCollapsed(true);
  }, []);

  // ページ遷移でモバイルメニューを閉じる
  useEffect(() => {
    closeMobile();
  }, [pathname, closeMobile]);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  const sidebarContent = (
    <>
      {/* ロゴ / システム名 */}
      <div className={cn('border-b border-white/10 overflow-hidden', collapsed && !mobileOpen ? 'p-4' : 'px-6 py-5')}>
        {collapsed && !mobileOpen ? (
          <span className="text-lg font-bold text-white">{title[0]}</span>
        ) : (
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold whitespace-nowrap text-white tracking-tight">{title}</h1>
            {/* モバイル: 閉じるボタン */}
            <button
              onClick={closeMobile}
              className="lg:hidden flex h-7 w-7 items-center justify-center rounded-md text-white/60 hover:text-white hover:bg-white/10"
              aria-label="メニューを閉じる"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* 事業切り替え */}
      {showBusinessSwitcher && (!collapsed || mobileOpen) && (
        <div className="px-3 py-4 border-b border-white/10">
          <BusinessSwitcher variant="sidebar" />
        </div>
      )}

      {/* ナビゲーション */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {items
          .filter((item) => !item.adminOnly || user?.role === 'admin')
          .filter((item) => !item.partnerAdminOnly || user?.role === 'partner_admin')
          .filter((item) => !item.requiresBusiness || hasSelectedBusiness)
          .map((item) => {
          const showCollapsed = collapsed && !mobileOpen;
          const isActive =
            pathname === item.href ||
            (pathname.startsWith(`${item.href}/`) &&
              !items.some((other) => other.href !== item.href && other.href.startsWith(`${item.href}/`) && pathname.startsWith(other.href)));
          return (
            <div key={item.href} className="relative group">
              <Link
                href={item.href}
                className={cn(
                  'flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  showCollapsed ? 'justify-center gap-0' : 'gap-3',
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-sidebar-accent hover:bg-white/5 hover:text-white',
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {!showCollapsed && <span>{item.label}</span>}
              </Link>
              {/* 折りたたみ時のツールチップ */}
              {showCollapsed && (
                <div className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-popover text-popover-foreground px-2 py-1 text-sm shadow-md border opacity-0 group-hover:opacity-100 transition-opacity z-50">
                  {item.label}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* ユーザー情報 + ログアウト */}
      <div className="border-t border-white/10 p-3">
        {collapsed && !mobileOpen ? (
          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              aria-label="ログアウト"
              className="text-sidebar-accent hover:text-white hover:bg-white/10"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
              <User className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-white">{user?.name}</p>
              <p className="text-xs truncate text-sidebar-accent">{user?.email}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              aria-label="ログアウト"
              className="shrink-0 text-sidebar-accent hover:text-white hover:bg-white/10"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* デスクトップ: 通常サイドバー */}
      <aside
        className={cn(
          'relative hidden lg:flex h-full flex-col bg-sidebar text-sidebar-foreground transition-all duration-300',
          collapsed ? 'w-16' : 'w-64',
        )}
      >
        {/* トグルボタン */}
        <button
          onClick={toggle}
          className="absolute -right-3 top-6 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm hover:bg-muted transition-colors"
          aria-label={collapsed ? 'サイドバーを展開' : 'サイドバーを折りたたむ'}
        >
          {collapsed ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronLeft className="h-3 w-3" />
          )}
        </button>

        {sidebarContent}
      </aside>

      {/* モバイル: オーバーレイサイドバー */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          {/* 背景オーバーレイ */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeMobile}
            aria-hidden="true"
          />
          {/* サイドバー本体 */}
          <aside className="relative flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
