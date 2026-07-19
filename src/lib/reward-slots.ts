import { z } from 'zod';

// ============================================
// 報酬スロット（ショット×ストック×直×間接）共通型・検証
// ============================================
//
// 報酬設定の1単位を RewardSetting = { type, value } で表し、
// ショット/ストック × 直紹介/間接 の最大4スロットを RewardSlots で持つ。
// 事業デフォルト（businessConfig.rewardConfig.defaults）/ 代理店リンク（rewardSlots）/
// 案件（rewardOverride）の3層で、部分的に上書きしてマージする。

export type RewardType = 'rate' | 'fixed';

export interface RewardSetting {
  type: RewardType;
  value: number;
}

export interface RewardSide {
  direct?: RewardSetting;
  indirect?: RewardSetting;
}

export interface RewardSlots {
  shot?: RewardSide;
  stock?: RewardSide;
}

// --- Zod スキーマ（API 入力検証・JSON パース用）---

const rewardSettingSchema = z.object({
  type: z.enum(['rate', 'fixed']),
  value: z.number().min(0),
});

const rewardSideSchema = z.object({
  direct: rewardSettingSchema.optional(),
  indirect: rewardSettingSchema.optional(),
});

export const rewardSlotsSchema = z.object({
  shot: rewardSideSchema.optional(),
  stock: rewardSideSchema.optional(),
});

/**
 * 未知の JSON（DB の Json 値）を RewardSlots として安全に読む。
 * 不正な形は空スロットにフォールバック（計算を落とさない）。
 */
export function parseRewardSlots(value: unknown): RewardSlots {
  if (!value || typeof value !== 'object') return {};
  const result = rewardSlotsSchema.safeParse(value);
  return result.success ? result.data : {};
}

/**
 * 3層（事業デフォルト→リンク→案件）の RewardSlots をマージする。
 * スロット単位（shot.direct 等）で、後勝ちで上書きする。
 */
export function mergeRewardSlots(...layers: (RewardSlots | null | undefined)[]): RewardSlots {
  const merged: RewardSlots = {};
  for (const layer of layers) {
    if (!layer) continue;
    for (const kind of ['shot', 'stock'] as const) {
      const side = layer[kind];
      if (!side) continue;
      merged[kind] = merged[kind] ?? {};
      if (side.direct !== undefined) merged[kind]!.direct = side.direct;
      if (side.indirect !== undefined) merged[kind]!.indirect = side.indirect;
    }
  }
  return merged;
}
