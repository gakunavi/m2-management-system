// ============================================
// 事業レスポンス整形（共通）
// route.ts / [id]/route.ts で共用
// ============================================

export interface BusinessRow {
  id: number;
  businessCode: string;
  businessName: string;
  businessDescription: string | null;
  businessConfig: unknown;
  businessIsActive: boolean;
  businessSortOrder: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: number | null;
  updatedBy: number | null;
}

export function formatBusiness(b: BusinessRow) {
  return {
    ...b,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}
