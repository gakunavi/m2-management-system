import { z } from 'zod';

// ============================================
// PartnerBusinessLink の報酬フィールド 共通シリアライザ / バリデーション
// ============================================
//
// 代理店×事業リンクの報酬上書き（直紹介・間接）を API 応答/入力で扱うための共通定義。
// 旧 commissionRate（率）は directReward(type='rate') へ移行済み。

export interface RewardLinkFields {
  directRewardType: string | null;
  directRewardValue: Prismaish | null;
  indirectRewardType: string | null;
  indirectRewardValue: Prismaish | null;
}

// Prisma.Decimal を Number 化するために許容する最小型
type Prismaish = { toString(): string } | number;

export function serializeRewardLinkFields(link: RewardLinkFields) {
  return {
    directRewardType: link.directRewardType,
    directRewardValue: link.directRewardValue != null ? Number(link.directRewardValue) : null,
    indirectRewardType: link.indirectRewardType,
    indirectRewardValue: link.indirectRewardValue != null ? Number(link.indirectRewardValue) : null,
  };
}

/** 報酬設定の入力バリデーション（create/update 共通） */
export const rewardLinkInputSchema = {
  directRewardType: z.enum(['rate', 'fixed']).nullable().optional(),
  directRewardValue: z.number().min(0).nullable().optional(),
  indirectRewardType: z.enum(['rate', 'fixed']).nullable().optional(),
  indirectRewardValue: z.number().min(0).nullable().optional(),
};

interface RewardLinkInput {
  directRewardType?: string | null;
  directRewardValue?: number | null;
  indirectRewardType?: string | null;
  indirectRewardValue?: number | null;
}

/** PATCH の update data 用: 指定された報酬フィールドだけを含むオブジェクトを返す */
export function rewardLinkUpdateData(data: RewardLinkInput) {
  return {
    ...(data.directRewardType !== undefined ? { directRewardType: data.directRewardType } : {}),
    ...(data.directRewardValue !== undefined ? { directRewardValue: data.directRewardValue } : {}),
    ...(data.indirectRewardType !== undefined ? { indirectRewardType: data.indirectRewardType } : {}),
    ...(data.indirectRewardValue !== undefined ? { indirectRewardValue: data.indirectRewardValue } : {}),
  };
}
