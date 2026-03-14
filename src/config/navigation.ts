import { LayoutDashboard, Briefcase, Users, Building2, UserCog, FolderKanban, BarChart3, BookOpen, MessageSquare, FileBarChart, Megaphone } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  /** 代理店管理者のみ表示 */
  partnerAdminOnly?: boolean;
  /** 個別事業が選択されている場合のみ表示 */
  requiresBusiness?: boolean;
}

/** 社内ユーザー用ナビゲーション */
export const mainNavItems: NavItem[] = [
  { label: 'ダッシュボード', href: '/dashboard', icon: LayoutDashboard },
  { label: '契約マスタ', href: '/projects', icon: FolderKanban, requiresBusiness: true },
  { label: '案件ムーブメント', href: '/movements', icon: BarChart3, requiresBusiness: true },
  { label: '事業マスタ', href: '/businesses', icon: Briefcase },
  { label: '顧客マスタ', href: '/customers', icon: Users },
  { label: '代理店マスタ', href: '/partners', icon: Building2 },
  { label: '月次レポート', href: '/reports', icon: FileBarChart },
  { label: 'QA/ナレッジ', href: '/qa', icon: BookOpen },
  { label: '問い合わせ', href: '/inquiries', icon: MessageSquare },
  { label: 'お知らせ管理', href: '/announcements', icon: Megaphone },
  { label: 'ユーザー管理', href: '/admin/users', icon: UserCog, adminOnly: true },
];

/** 代理店ユーザー用ナビゲーション */
export const partnerNavItems: NavItem[] = [
  { label: 'ダッシュボード', href: '/portal', icon: LayoutDashboard },
  { label: '契約一覧', href: '/portal/projects', icon: FolderKanban, requiresBusiness: true },
  { label: '案件ムーブメント', href: '/portal/movements', icon: BarChart3, requiresBusiness: true },
  { label: '月次レポート', href: '/reports', icon: FileBarChart },
  { label: 'QA/ナレッジ', href: '/qa', icon: BookOpen },
  { label: '問い合わせ', href: '/inquiries', icon: MessageSquare },
  { label: 'スタッフ管理', href: '/portal/staff', icon: UserCog, partnerAdminOnly: true },
];
