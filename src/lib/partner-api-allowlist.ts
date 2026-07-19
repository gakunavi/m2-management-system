// ============================================
// 代理店ロール向け API 許可リスト（deny by default）
// ============================================
//
// 背景:
//   middleware は /api/v1/* を「セッションの有無」だけで通していたため、
//   ロールチェックを各ルートの実装任せにしていた。書き込み系にはチェックが
//   あるが読み取り系（GET）には抜けが多く、代理店ユーザーが顧客の個人情報・
//   銀行口座・他代理店の手数料率などに到達できる状態だった。
//
// 方針:
//   代理店ロール（partner_admin / partner_staff）が呼ぶ必要のある API を
//   ここに列挙し、それ以外は middleware で 403 にする。
//   各ルート内の個別チェックは残す（多層防御）。
//
// 注意:
//   middleware は Edge Runtime で動くため、このモジュールは DB や Node API に
//   依存してはならない（純粋なパターンマッチのみ）。
//
// 新しく代理店向け画面を追加したときは、ここへ追記しないと 403 になる。
// これは意図的な設計で、追加漏れが「情報漏洩」ではなく「機能不全」として
// 表面化するようにしている。

export type PartnerRole = 'partner_admin' | 'partner_staff';

const BOTH: readonly PartnerRole[] = ['partner_admin', 'partner_staff'];
const ADMIN_ONLY: readonly PartnerRole[] = ['partner_admin'];

interface AllowRule {
  pattern: RegExp;
  methods: readonly string[];
  roles: readonly PartnerRole[];
}

const ALLOWLIST: readonly AllowRule[] = [
  // --- ヘルスチェック ---
  { pattern: /^\/api\/v1\/health$/, methods: ['GET'], roles: BOTH },

  // --- 代理店ポータル本体 ---
  {
    pattern: /^\/api\/v1\/portal\/(summary|revenue-trend|pipeline|projects|movements|documents|rewards)$/,
    methods: ['GET'],
    roles: BOTH,
  },
  // ランキングは代理店管理者のみ（スタッフ別・下位代理店別の成績が見えるため）
  { pattern: /^\/api\/v1\/portal\/partner-ranking$/, methods: ['GET'], roles: ADMIN_ONLY },

  // --- 自代理店のスタッフ管理（partner_admin のみ）---
  { pattern: /^\/api\/v1\/partner-staff$/, methods: ['GET', 'POST'], roles: ADMIN_ONLY },
  {
    pattern: /^\/api\/v1\/partner-staff\/\d+$/,
    methods: ['GET', 'PATCH', 'DELETE'],
    roles: ADMIN_ONLY,
  },

  // --- 共通シェル（事業スイッチャー・お知らせバナー）---
  // どちらも API 側で代理店のリンク事業・公開範囲に絞り込まれる
  { pattern: /^\/api\/v1\/businesses$/, methods: ['GET'], roles: BOTH },
  { pattern: /^\/api\/v1\/announcements$/, methods: ['GET'], roles: BOTH },

  // --- 月次レポート（代理店スコープあり）---
  { pattern: /^\/api\/v1\/reports\/partner-monthly$/, methods: ['GET'], roles: BOTH },

  // --- Q&A（公開済み・公開フラグONのみ返る）---
  { pattern: /^\/api\/v1\/qa\/items$/, methods: ['GET'], roles: BOTH },
  { pattern: /^\/api\/v1\/qa\/items\/\d+$/, methods: ['GET'], roles: BOTH },
  { pattern: /^\/api\/v1\/qa\/categories$/, methods: ['GET'], roles: BOTH },

  // --- 問い合わせ（自分が作成したもののみ参照可）---
  { pattern: /^\/api\/v1\/inquiries$/, methods: ['GET', 'POST'], roles: BOTH },
  { pattern: /^\/api\/v1\/inquiries\/\d+$/, methods: ['GET'], roles: BOTH },

  // --- 通知（すべて userId = 自分 にスコープ済み）---
  { pattern: /^\/api\/v1\/notifications$/, methods: ['GET'], roles: BOTH },
  { pattern: /^\/api\/v1\/notifications\/read-all$/, methods: ['PATCH'], roles: BOTH },
  { pattern: /^\/api\/v1\/notifications\/delete-all$/, methods: ['DELETE'], roles: BOTH },
  { pattern: /^\/api\/v1\/notifications\/\d+\/read$/, methods: ['PATCH'], roles: BOTH },
  { pattern: /^\/api\/v1\/notifications\/\d+\/delete$/, methods: ['DELETE'], roles: BOTH },

  // --- Web Push 購読（自分の購読のみ）---
  { pattern: /^\/api\/v1\/push-subscriptions$/, methods: ['POST', 'DELETE'], roles: BOTH },
];

export function isPartnerRole(role: string | undefined): role is PartnerRole {
  return role === 'partner_admin' || role === 'partner_staff';
}

/**
 * 代理店ロールがこの API リクエストを実行してよいか判定する。
 * 許可リストに一致しなければ false（deny by default）。
 */
export function isPartnerApiAllowed(
  pathname: string,
  method: string,
  role: PartnerRole,
): boolean {
  // 末尾スラッシュを正規化（/api/v1/customers/ で回避されないように）
  const normalized =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

  return ALLOWLIST.some(
    (rule) =>
      rule.pattern.test(normalized) &&
      rule.methods.includes(method) &&
      rule.roles.includes(role),
  );
}
