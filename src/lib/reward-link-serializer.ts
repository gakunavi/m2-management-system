import { z } from 'zod';
import { parseRewardSlots, rewardSlotsSchema, type RewardSlots } from '@/lib/reward-slots';

// ============================================
// PartnerBusinessLink の報酬フィールド 共通シリアライザ / バリデーション
// ============================================
//
// 代理店×事業リンクの報酬上書き（RewardSlots）と支払いタイミング特例を
// API 応答/入力で扱うための共通定義。

export interface RewardLinkFields {
  rewardSlots: unknown;
  paymentTiming: string | null;
  closingDay: number | null;
}

export function serializeRewardLinkFields(link: RewardLinkFields) {
  return {
    rewardSlots: parseRewardSlots(link.rewardSlots),
    paymentTiming: link.paymentTiming,
    closingDay: link.closingDay,
  };
}

/** 報酬設定の入力バリデーション（create/update 共通） */
export const rewardLinkInputSchema = {
  rewardSlots: rewardSlotsSchema.nullable().optional(),
  paymentTiming: z.enum(['same', 'next', 'next2', 'closing']).nullable().optional(),
  closingDay: z.number().int().min(1).max(31).nullable().optional(),
};

interface RewardLinkInput {
  rewardSlots?: RewardSlots | null;
  paymentTiming?: string | null;
  closingDay?: number | null;
}

/**
 * PATCH の update data 用: 指定された報酬フィールドだけを含むオブジェクトを返す。
 * rewardSlots は null のとき空スロット {} として保存（クリア相当）。
 */
export function rewardLinkUpdateData(data: RewardLinkInput) {
  return {
    ...(data.rewardSlots !== undefined
      ? { rewardSlots: (data.rewardSlots ?? {}) as object }
      : {}),
    ...(data.paymentTiming !== undefined ? { paymentTiming: data.paymentTiming } : {}),
    ...(data.closingDay !== undefined ? { closingDay: data.closingDay } : {}),
  };
}
