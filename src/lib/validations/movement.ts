import { z } from 'zod';

export const MOVEMENT_STATUSES = ['pending', 'started', 'completed', 'skipped', 'unnecessary'] as const;
export type MovementStatus = (typeof MOVEMENT_STATUSES)[number];

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
