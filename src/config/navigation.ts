import { LayoutDashboard, Briefcase, Users, Building2, UserCog, FolderKanban, BarChart3, BookOpen, MessageSquare, FileBarChart, Megaphone, Bot, Settings, CheckSquare } from 'lucide-react';
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

export interface NavSection {
  label?: string; // undefinedならセクションラベルなし
  items: NavItem[];
}

// ============================================
// 社内ユーザー用: サイドバー（コア業務のみ）
// ============================================

export const mainNavSections: NavSection[] = [
  {
    items: [
      { label: 'ダッシュボード', href: '/dashboard', icon: LayoutDashboard },
      { label: 'タスク管理', href: '/tasks', icon: CheckSquare },
    ],
  },
  {
    label: '営業',
    items: [
      { label: '契約マスタ', href: '/projects', icon: FolderKanban, requiresBusiness: true },
      { label: '案件ムーブメント', href: '/movements', icon: BarChart3, requiresBusiness: true },
    ],
  },
  {
    label: 'マスタ',
    items: [
      { label: '事業マスタ', href: '/businesses', icon: Briefcase },
      { label: '顧客マスタ', href: '/customers', icon: Users },
      { label: '代理店マスタ', href: '/partners', icon: Building2 },
    ],
  },
  {
    label: 'レポート',
    items: [
      { label: '月次レポート', href: '/reports', icon: FileBarChart },
    ],
  },
];

// ============================================
// 社内ユーザー用: ヘッダークイックアクセス
// ============================================

export const headerQuickItems: NavItem[] = [
  { label: 'AIアシスタント', href: '/ai-assistant', icon: Bot },
  { label: '問い合わせ', href: '/inquiries', icon: MessageSquare },
  { label: 'QA/ナレッジ', href: '/qa', icon: BookOpen },
];

// ============================================
// 社内ユーザー用: ユーザーメニュー
// ============================================

export const userMenuItems: NavItem[] = [
  { label: 'お知らせ管理', href: '/announcements', icon: Megaphone },
  { label: 'ユーザー管理', href: '/admin/users', icon: UserCog, adminOnly: true },
  { label: 'システム設定', href: '/admin/settings', icon: Settings, adminOnly: true },
];

// ============================================
// 後方互換: フラットなmainNavItems（既存参照用）
// ============================================

export const mainNavItems: NavItem[] = mainNavSections.flatMap((s) => s.items);

// ============================================
// 代理店ユーザー用ナビゲーション
// ============================================

export const partnerNavSections: NavSection[] = [
  {
    items: [
      { label: 'ダッシュボード', href: '/portal', icon: LayoutDashboard },
    ],
  },
  {
    label: '営業',
    items: [
      { label: '契約一覧', href: '/portal/projects', icon: FolderKanban, requiresBusiness: true },
      { label: '案件ムーブメント', href: '/portal/movements', icon: BarChart3, requiresBusiness: true },
    ],
  },
  {
    label: 'サポート',
    items: [
      { label: '月次レポート', href: '/reports', icon: FileBarChart },
      { label: 'QA/ナレッジ', href: '/qa', icon: BookOpen },
      { label: '問い合わせ', href: '/inquiries', icon: MessageSquare },
    ],
  },
  {
    label: '管理',
    items: [
      { label: 'スタッフ管理', href: '/portal/staff', icon: UserCog, partnerAdminOnly: true },
    ],
  },
];

/** 代理店ユーザー用フラット（後方互換） */
export const partnerNavItems: NavItem[] = partnerNavSections.flatMap((s) => s.items);
