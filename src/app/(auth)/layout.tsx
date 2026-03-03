import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-3 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:m-2">
        メインコンテンツへスキップ
      </a>
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main id="main-content" className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
