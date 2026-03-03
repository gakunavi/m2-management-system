'use client';

import { useAuth } from '@/hooks/use-auth';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { partnerNavItems } from '@/config/navigation';

export default function SharedLayout({ children }: { children: React.ReactNode }) {
  const { isPartner } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        navItems={isPartner ? partnerNavItems : undefined}
        showBusinessSwitcher={true}
        title={isPartner ? '代理店ポータル' : undefined}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
