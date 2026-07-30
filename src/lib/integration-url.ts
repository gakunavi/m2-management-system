// ============================================
// 連携APIが返す管理画面URLの組み立て
// ============================================

/** 末尾スラッシュを落とした公開URL */
function baseUrl(): string {
  return (process.env.NEXTAUTH_URL ?? '').replace(/\/+$/, '');
}

/** 顧客詳細画面のURL（管理画面で開ける形） */
export function customerAdminUrl(customerId: number): string {
  return `${baseUrl()}/customers/${customerId}`;
}
