import { z } from 'zod';

export const projectBaseSchema = z.object({
  businessId: z.number().int().positive('事業を選択してください'),
  customerId: z.number().int().positive('顧客を選択してください'),
  partnerId: z.number().int().positive().optional().nullable(),
  projectSalesStatus: z.string().min(1, '営業ステータスを選択してください'),
  projectExpectedCloseMonth: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'YYYY-MM形式で入力してください')
    .optional()
    .nullable()
    .or(z.literal('')),
  projectAssignedUserId: z.number().int().positive().optional().nullable(),
  projectAssignedUserName: z
    .string()
    .max(100, '担当者名は100文字以内で入力してください')
    .optional()
    .nullable()
    .or(z.literal('')),
  projectNotes: z
    .string()
    .max(2000, '備考は2000文字以内で入力してください')
    .optional()
    .nullable()
    .or(z.literal('')),
  projectRenovationNumber: z
    .string()
    .max(100, '階層番号は100文字以内で入力してください')
    .optional()
    .nullable()
    .or(z.literal('')),
  portalVisible: z.boolean().optional(),
});

export type ProjectBaseInput = z.infer<typeof projectBaseSchema>;
