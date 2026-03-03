import { z } from 'zod';

// ============================================
// 口座情報 共通 Zod スキーマ
// ============================================

export const createBankAccountSchema = z.object({
  businessId: z.number().int().positive().optional().nullable(),
  bankName: z.string().min(1, '金融機関名は必須です').max(100),
  branchName: z.string().min(1, '支店名は必須です').max(100),
  accountType: z.enum(['普通', '当座']),
  accountNumber: z.string().min(1, '口座番号は必須です').max(20),
  accountHolder: z.string().min(1, '名義人は必須です').max(100),
});

export const updateBankAccountSchema = z.object({
  bankName: z.string().min(1).max(100).optional(),
  branchName: z.string().min(1).max(100).optional(),
  accountType: z.enum(['普通', '当座']).optional(),
  accountNumber: z.string().min(1).max(20).optional(),
  accountHolder: z.string().min(1).max(100).optional(),
});

// ============================================
// 口座情報 共通レスポンス整形
// ============================================

export function formatBankAccount(a: {
  id: number;
  businessId: number | null;
  bankName: string;
  branchName: string;
  accountType: string;
  accountNumber: string;
  accountHolder: string;
  createdAt: Date;
  updatedAt: Date;
  business: { id: number; businessName: string; businessCode: string } | null;
  [key: string]: unknown;
}) {
  return {
    ...a,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

export const BUSINESS_INCLUDE = {
  business: {
    select: { id: true, businessName: true, businessCode: true },
  },
} as const;
