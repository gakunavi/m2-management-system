'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { mainNavSections, mainNavItems, type NavSection, type NavItem } from '@/config/navigation';
import { BusinessSwitcher } from './business-switcher';
import { useAuth } from '@/hooks/use-auth';
import { useBusiness } from '@/hooks/use-business';
import { useMobileMenu } from '@/hooks/use-mobile-menu';
import { useState, useEffect } from 'react';

const STORAGE_KEY = 'sidebar-collapsed';

interface SidebarProps {
  navSections?: NavSection[];
  navItems?: NavItem[];
  showBusinessSwitcher?: boolean;
  title?: string;
}

export function Sidebar({ navSections, navItems, showBusinessSwitcher = true, title = '管理システム' }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { hasSelectedBusiness } = useBusiness();
  const { isOpen: mobileOpen, close: closeMobile } = useMobileMenu();
  const [collapsed, setCollapsed] = useState(false);

  const sections = navSections ?? mainNavSections;
  const allItems = navItems ?? mainNavItems;

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'true') setCollapsed(true);
  }, []);

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

  const showCollapsed = collapsed && !mobileOpen;

  const isItemVisible = (item: NavItem) => {
    if (item.adminOnly && user?.role !== 'admin') return false;
    if (item.partnerAdminOnly && user?.role !== 'partner_admin') return false;
    if (item.requiresBusiness && !hasSelectedBusiness) return false;
    return true;
  };

  const isActive = (item: NavItem) =>
    pathname === item.href ||
    (pathname.startsWith(`${item.href}/`) &&
      !allItems.some((other) => other.href !== item.href && other.href.startsWith(`${item.href}/`) && pathname.startsWith(other.href)));

  const renderNavItem = (item: NavItem) => {
    if (!isItemVisible(item)) return null;
    const active = isActive(item);

    return (
      <div key={item.href} className="relative group">
        <Link
          href={item.href}
          className={cn(
            'flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            showCollapsed ? 'justify-center gap-0' : 'gap-3',
            active
              ? 'bg-white/10 text-white'
              : 'text-sidebar-accent hover:bg-white/5 hover:text-white',
          )}
        >
          <item.icon className="h-5 w-5 shrink-0" />
          {!showCollapsed && <span>{item.label}</span>}
        </Link>
        {showCollapsed && (
          <div className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-popover text-popover-foreground px-2 py-1 text-sm shadow-md border opacity-0 group-hover:opacity-100 transition-opacity z-50">
            {item.label}
          </div>
        )}
      </div>
    );
  };

  const sidebarContent = (
    <>
      {/* ロゴ / システム名 */}
      <div className={cn('border-b border-white/10 overflow-hidden', showCollapsed ? 'p-4' : 'px-6 py-5')}>
        {showCollapsed ? (
          <span className="text-lg font-bold text-white">{title[0]}</span>
        ) : (
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold whitespace-nowrap text-white tracking-tight">{title}</h1>
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
      {showBusinessSwitcher && !showCollapsed && (
        <div className="px-3 py-4 border-b border-white/10">
          <BusinessSwitcher variant="sidebar" />
        </div>
      )}

      {/* セクション付きナビゲーション */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        {sections.map((section, sIdx) => {
          const visibleItems = section.items.filter(isItemVisible);
          if (visibleItems.length === 0) return null;

          return (
            <div key={sIdx} className={cn(sIdx > 0 && 'mt-4')}>
              {/* セクションラベル */}
              {section.label && !showCollapsed && (
                <div className="px-3 mb-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
                    {section.label}
                  </span>
                </div>
              )}
              {section.label && showCollapsed && (
                <div className="flex justify-center mb-1">
                  <div className="h-px w-6 bg-white/20" />
                </div>
              )}
              <div className="space-y-0.5">
                {visibleItems.map(renderNavItem)}
              </div>
            </div>
          );
        })}
      </nav>
    </>
  );

  return (
    <>
      {/* デスクトップ */}
      <aside
        className={cn(
          'relative hidden lg:flex h-full flex-col bg-sidebar text-sidebar-foreground transition-all duration-300',
          collapsed ? 'w-16' : 'w-64',
        )}
      >
        <button
          onClick={toggle}
          className="absolute -right-3 top-6 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm hover:bg-muted transition-colors"
          aria-label={collapsed ? 'サイドバーを展開' : 'サイドバーを折りたたむ'}
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>
        {sidebarContent}
      </aside>

      {/* モバイル */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={closeMobile} aria-hidden="true" />
          <aside className="relative flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
