import { z } from 'zod';

export const salesTargetBulkSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  kpiKey: z.string().min(1).max(50).default('revenue'),
  targets: z
    .array(
      z.object({
        month: z.string().regex(/^\d{4}-\d{2}$/, '月の形式が不正です'),
        targetAmount: z.number().min(0, '値は0以上で入力してください'),
      }),
    )
    .length(12, '12ヶ月分の目標を入力してください'),
});

export const kpiDefinitionSchema = z.object({
  key: z
    .string()
    .min(1, 'キーは必須です')
    .max(50)
    .regex(/^[a-z][a-z0-9_]*$/, 'キーは英小文字・数字・アンダースコアのみ'),
  label: z.string().min(1, 'ラベルは必須です').max(50),
  unit: z.string().min(1, '単位は必須です').max(10),
  aggregation: z.enum(['sum', 'count']),
  sourceField: z.string().nullable(),
  statusFilter: z.string().nullable(),
  dateField: z.string().min(1, '計上月基準は必須です'),
  isPrimary: z.boolean(),
  sortOrder: z.number().int().min(0),
});

export const kpiDefinitionsSchema = z
  .array(kpiDefinitionSchema)
  .refine(
    (defs) => {
      const keys = defs.map((d) => d.key);
      return new Set(keys).size === keys.length;
    },
    { message: 'KPIキーは一意である必要があります' },
  )
  .refine((defs) => defs.filter((d) => d.isPrimary).length <= 1, {
    message: 'プライマリKPIは1つだけ設定できます',
  });

// 後方互換: 旧計上ルール用
export const revenueRecognitionSchema = z
  .object({
    statusCode: z.string().min(1, 'ステータスを選択してください'),
    amountField: z.string().min(1, '金額フィールドを選択してください'),
    dateField: z.string().min(1, '計上月基準を選択してください'),
  })
  .nullable();
