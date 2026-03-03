import { z } from 'zod';

// ============================================
// QAカテゴリ バリデーションスキーマ
// ============================================

export const qaCategorySchema = z.object({
  categoryName: z.string().min(1, 'カテゴリ名は必須です').max(100, 'カテゴリ名は100文字以内で入力してください'),
  categoryDescription: z.string().optional().nullable(),
  categorySortOrder: z.number().int().min(0, '表示順は0以上の整数で入力してください').default(0),
  categoryIsActive: z.boolean().default(true),
});

// ============================================
// QAアイテム バリデーションスキーマ
// ============================================

export const qaItemSchema = z.object({
  categoryId: z.number().int().positive('カテゴリIDは正の整数で入力してください'),
  businessId: z.number().int().positive().optional().nullable(),
  itemTitle: z.string().min(1, 'タイトルは必須です').max(200, 'タイトルは200文字以内で入力してください'),
  itemQuestion: z.string().min(1, '質問内容は必須です'),
  itemAnswer: z.string().min(1, '回答内容は必須です'),
  itemStatus: z.enum(['draft', 'published']).default('draft'),
  itemIsPublic: z.boolean().default(false),
  itemSortOrder: z.number().int().min(0, '表示順は0以上の整数で入力してください').default(0),
});
