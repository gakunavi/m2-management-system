import { z } from 'zod';

export const MOVEMENT_STATUSES = ['pending', 'started', 'completed', 'skipped', 'unnecessary'] as const;
export type MovementStatus = (typeof MOVEMENT_STATUSES)[number];

/**
 * 状態の画面での呼び名。
 *
 * 画面（ムーブメントタブ・編集モーダル・ガント）は色とアイコンも要るので各自
 * テーブルを持っているが、**文言はここと同じにすること**。ML連携APIはこの表を
 * そのまま `status_label` として返す。
 */
export const MOVEMENT_STATUS_LABELS: Record<MovementStatus, string> = {
  pending: '未着手',
  started: '進行中',
  completed: '完了',
  skipped: 'スキップ',
  unnecessary: '不要',
};

export const updateMovementSchema = z.object({
  movementStatus: z.enum(MOVEMENT_STATUSES).optional(),
  movementNotes: z.string().max(2000).optional().nullable().or(z.literal('')),
  movementStartedAt: z.string().optional().nullable(),
  movementCompletedAt: z.string().optional().nullable(),
  /** 連動フィールドの値更新（キーと値のペア） */
  linkedFieldUpdate: z.object({
    key: z.string(),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  }).optional(),
});
