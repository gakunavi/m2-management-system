import { z } from 'zod';

// ============================================
// 問い合わせ作成スキーマ
// ============================================

export const inquiryCreateSchema = z.object({
  inquirySubject: z
    .string()
    .min(1, '件名を入力してください')
    .max(200, '件名は200文字以内で入力してください'),
  inquiryBody: z.string().min(1, '本文を入力してください'),
  inquiryBusinessId: z.number().int().positive().optional(),
  inquiryCategoryId: z.number().int().positive().optional(),
  inquiryProjectId: z.number().int().positive().optional(),
});

export type InquiryCreateInput = z.infer<typeof inquiryCreateSchema>;

// ============================================
// 問い合わせ更新スキーマ
// ============================================

export const inquiryUpdateSchema = z.object({
  inquiryStatus: z
    .enum(['new', 'in_progress', 'resolved', 'converted_to_qa'])
    .optional(),
  inquiryCategoryId: z.number().int().positive().optional().nullable(),
  inquiryAssignedUserId: z.number().int().positive().optional().nullable(),
});

export type InquiryUpdateInput = z.infer<typeof inquiryUpdateSchema>;

// ============================================
// 問い合わせ回答スキーマ
// ============================================

export const inquiryResponseSchema = z.object({
  inquiryResponse: z.string().min(1, '回答内容を入力してください'),
});

export type InquiryResponseInput = z.infer<typeof inquiryResponseSchema>;

// ============================================
// Q&A変換スキーマ
// ============================================

export const inquiryConvertToQaSchema = z.object({
  categoryId: z.number().int().positive('カテゴリを選択してください'),
  itemTitle: z
    .string()
    .min(1, 'タイトルを入力してください')
    .max(200, 'タイトルは200文字以内で入力してください'),
  itemIsPublic: z.boolean().default(false),
});

export type InquiryConvertToQaInput = z.infer<typeof inquiryConvertToQaSchema>;
