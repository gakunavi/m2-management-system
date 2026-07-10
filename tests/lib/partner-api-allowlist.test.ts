import { describe, it, expect } from 'vitest';
import { isPartnerApiAllowed, isPartnerRole } from '@/lib/partner-api-allowlist';

describe('isPartnerRole', () => {
  it('代理店ロールを判定する', () => {
    expect(isPartnerRole('partner_admin')).toBe(true);
    expect(isPartnerRole('partner_staff')).toBe(true);
  });

  it('社内ロール・未定義は代理店ではない', () => {
    expect(isPartnerRole('admin')).toBe(false);
    expect(isPartnerRole('staff')).toBe(false);
    expect(isPartnerRole(undefined)).toBe(false);
  });
});

describe('社内向けAPIへの代理店アクセスを拒否する', () => {
  // 監査で「代理店から到達できた」と確認された経路
  const forbidden: [string, string][] = [
    ['/api/v1/customers', 'GET'],
    ['/api/v1/customers/1', 'GET'],
    ['/api/v1/customers/1/bank-accounts', 'GET'],
    ['/api/v1/customers/1/contacts', 'GET'],
    ['/api/v1/customers/1/business-links', 'GET'],
    ['/api/v1/customers/csv', 'GET'],
    ['/api/v1/customers/duplicate-check', 'GET'],
    ['/api/v1/customers/filter-options', 'GET'],
    ['/api/v1/partners', 'GET'],
    ['/api/v1/partners/1', 'GET'],
    ['/api/v1/partners/1/bank-accounts', 'GET'],
    ['/api/v1/partners/1/business-links', 'GET'],
    ['/api/v1/partners/candidates', 'GET'],
    ['/api/v1/partners/1/group-tree', 'GET'],
    ['/api/v1/partners/csv', 'GET'],
    ['/api/v1/projects', 'GET'],
    ['/api/v1/projects/1', 'GET'],
    ['/api/v1/projects/csv', 'GET'],
    ['/api/v1/projects/1/files', 'GET'],
    ['/api/v1/projects/1/movements', 'GET'],
    ['/api/v1/projects/1/movements/2', 'PATCH'],
    ['/api/v1/users', 'GET'],
    ['/api/v1/users/1', 'GET'],
    ['/api/v1/admin/recalculate-tier-numbers', 'POST'],
    ['/api/v1/tasks', 'GET'],
    ['/api/v1/dashboard/summary', 'GET'],
    ['/api/v1/businesses/1', 'GET'],
    ['/api/v1/businesses/1/documents', 'GET'],
    ['/api/v1/system-settings', 'GET'],
    ['/api/v1/upload', 'POST'],
    ['/api/v1/reminders', 'GET'],
    ['/api/v1/ai/chat', 'POST'],
    ['/api/v1/accounting', 'GET'],
  ];

  it.each(forbidden)('partner_admin は %s %s にアクセスできない', (path, method) => {
    expect(isPartnerApiAllowed(path, method, 'partner_admin')).toBe(false);
  });

  it.each(forbidden)('partner_staff は %s %s にアクセスできない', (path, method) => {
    expect(isPartnerApiAllowed(path, method, 'partner_staff')).toBe(false);
  });
});

describe('ポータルに必要なAPIは許可する', () => {
  const allowedForBoth: [string, string][] = [
    ['/api/v1/portal/summary', 'GET'],
    ['/api/v1/portal/revenue-trend', 'GET'],
    ['/api/v1/portal/pipeline', 'GET'],
    ['/api/v1/portal/projects', 'GET'],
    ['/api/v1/portal/movements', 'GET'],
    ['/api/v1/portal/documents', 'GET'],
    ['/api/v1/businesses', 'GET'],
    ['/api/v1/announcements', 'GET'],
    ['/api/v1/reports/partner-monthly', 'GET'],
    ['/api/v1/qa/items', 'GET'],
    ['/api/v1/qa/items/12', 'GET'],
    ['/api/v1/qa/categories', 'GET'],
    ['/api/v1/inquiries', 'GET'],
    ['/api/v1/inquiries', 'POST'],
    ['/api/v1/inquiries/5', 'GET'],
    ['/api/v1/notifications', 'GET'],
    ['/api/v1/notifications/read-all', 'PATCH'],
    ['/api/v1/notifications/delete-all', 'DELETE'],
    ['/api/v1/notifications/3/read', 'PATCH'],
    ['/api/v1/notifications/3/delete', 'DELETE'],
    ['/api/v1/push-subscriptions', 'POST'],
    ['/api/v1/push-subscriptions', 'DELETE'],
    ['/api/v1/health', 'GET'],
  ];

  it.each(allowedForBoth)('両ロールが %s %s を呼べる', (path, method) => {
    expect(isPartnerApiAllowed(path, method, 'partner_admin')).toBe(true);
    expect(isPartnerApiAllowed(path, method, 'partner_staff')).toBe(true);
  });
});

describe('partner_admin 限定のAPI', () => {
  const adminOnly: [string, string][] = [
    ['/api/v1/portal/partner-ranking', 'GET'],
    ['/api/v1/partner-staff', 'GET'],
    ['/api/v1/partner-staff', 'POST'],
    ['/api/v1/partner-staff/7', 'GET'],
    ['/api/v1/partner-staff/7', 'PATCH'],
    ['/api/v1/partner-staff/7', 'DELETE'],
  ];

  it.each(adminOnly)('partner_admin は %s %s を呼べる', (path, method) => {
    expect(isPartnerApiAllowed(path, method, 'partner_admin')).toBe(true);
  });

  it.each(adminOnly)('partner_staff は %s %s を呼べない', (path, method) => {
    expect(isPartnerApiAllowed(path, method, 'partner_staff')).toBe(false);
  });
});

describe('メソッド単位で絞る', () => {
  it('許可された読み取りパスでも書き込みメソッドは拒否する', () => {
    expect(isPartnerApiAllowed('/api/v1/businesses', 'POST', 'partner_admin')).toBe(false);
    expect(isPartnerApiAllowed('/api/v1/announcements', 'POST', 'partner_admin')).toBe(false);
    expect(isPartnerApiAllowed('/api/v1/qa/items', 'POST', 'partner_admin')).toBe(false);
    expect(isPartnerApiAllowed('/api/v1/qa/categories', 'DELETE', 'partner_admin')).toBe(false);
  });

  it('問い合わせの回答・QA変換・添付は代理店から書き込めない', () => {
    expect(isPartnerApiAllowed('/api/v1/inquiries/5', 'PATCH', 'partner_admin')).toBe(false);
    expect(isPartnerApiAllowed('/api/v1/inquiries/5/respond', 'POST', 'partner_admin')).toBe(false);
    expect(isPartnerApiAllowed('/api/v1/inquiries/5/convert-to-qa', 'POST', 'partner_admin')).toBe(
      false,
    );
    expect(isPartnerApiAllowed('/api/v1/inquiries/5/attachments', 'POST', 'partner_admin')).toBe(
      false,
    );
  });
});

describe('パス正規化で許可リストを回避できない', () => {
  it('末尾スラッシュを付けても社内APIは拒否される', () => {
    expect(isPartnerApiAllowed('/api/v1/customers/', 'GET', 'partner_admin')).toBe(false);
  });

  it('末尾スラッシュ付きのポータルAPIは許可される', () => {
    expect(isPartnerApiAllowed('/api/v1/portal/summary/', 'GET', 'partner_admin')).toBe(true);
  });

  it('前方一致で別リソースに化けない（portal 以外の派生パス）', () => {
    expect(isPartnerApiAllowed('/api/v1/portal/summary/secret', 'GET', 'partner_admin')).toBe(false);
    expect(isPartnerApiAllowed('/api/v1/businesses/1/documents', 'GET', 'partner_admin')).toBe(
      false,
    );
    expect(isPartnerApiAllowed('/api/v1/partner-staff/7/reset', 'POST', 'partner_admin')).toBe(
      false,
    );
  });

  it('数値以外のIDセグメントは許可しない', () => {
    expect(isPartnerApiAllowed('/api/v1/qa/items/..%2F..%2Fusers', 'GET', 'partner_admin')).toBe(
      false,
    );
    expect(isPartnerApiAllowed('/api/v1/partner-staff/abc', 'GET', 'partner_admin')).toBe(false);
  });
});
