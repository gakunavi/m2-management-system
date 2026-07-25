import { z } from 'zod';
import { rewardSettingSchema, type RewardSetting } from '@/lib/reward-slots';

// ============================================
// 自社取り分（レベニューシェア）共通型・検証
// ============================================
//
// 取扱高（顧客が支払う総額）のうち、自社の売上になる分を表す。
// 代理店報酬（RewardSlots）と同じ RewardSetting = { type, value } を使い、
// ショット（契約確定時に1回）/ストック（継続中は毎月）の2スロットを持つ。
//
// 2層で解決する（代理店に依存しないので代理店リンク層は無い）:
//   事業デフォルト businessConfig.rewardConfig.companyShare
//     → 案件別上書き Project.companyShareOverride
//
// 「未設定」は 0 として扱う（自社売上に計上しない）。報酬スロットと同じ方針で、
// 未設定を 100% とみなして取扱高全額を自社売上に載せる方が誤差が大きいため。
// 事業デフォルトが両スロットとも未設定なら、その事業では収益管理そのものが
// 未設定とみなし、画面側で P/L を出さない（isCompanyShareConfigured）。

/** ショット/ストックの取り分。undefined は「未設定」＝自社売上に計上しない */
export interface CompanyShare {
  shot?: RewardSetting;
  stock?: RewardSetting;
}

/** 事業デフォルトの取り分設定（基準金額フィールドの上書きを含む） */
export interface CompanyShareConfig extends CompanyShare {
  /** ショット取り分の基準金額フィールド。null=報酬の shotBaseField を使う */
  shotBaseField?: string | null;
  /** ストック取り分の基準金額フィールド（月額）。null=報酬の stockBaseField を使う */
  stockBaseField?: string | null;
}

// --- Zod スキーマ（API 入力検証・JSON パース用）---

export const companyShareSchema = z.object({
  shot: rewardSettingSchema.optional(),
  stock: rewardSettingSchema.optional(),
});

export const companyShareConfigSchema = companyShareSchema.extend({
  shotBaseField: z.string().nullable().optional(),
  stockBaseField: z.string().nullable().optional(),
});

/**
 * 未知の JSON（DB の Json 値）を CompanyShare として安全に読む。
 * 不正な形は空にフォールバックする（計算を落とさない）。
 */
export function parseCompanyShare(value: unknown): CompanyShare {
  if (!value || typeof value !== 'object') return {};
  const result = companyShareSchema.safeParse(value);
  return result.success ? result.data : {};
}

/** 事業設定の JSON を CompanyShareConfig として安全に読む */
export function parseCompanyShareConfig(value: unknown): CompanyShareConfig {
  if (!value || typeof value !== 'object') return {};
  const result = companyShareConfigSchema.safeParse(value);
  return result.success ? result.data : {};
}

/**
 * 事業デフォルト → 案件上書き をスロット単位（shot / stock）で後勝ちマージする。
 */
export function mergeCompanyShare(...layers: (CompanyShare | null | undefined)[]): CompanyShare {
  const merged: CompanyShare = {};
  for (const layer of layers) {
    if (!layer) continue;
    if (layer.shot !== undefined) merged.shot = layer.shot;
    if (layer.stock !== undefined) merged.stock = layer.stock;
  }
  return merged;
}

/**
 * その事業で自社取り分が設定済みか（ショット/ストックのいずれか1つでもあれば true）。
 * false のときは自社売上・粗利を「0」ではなく「未設定」として扱い、画面に出さない。
 */
export function isCompanyShareConfigured(share: CompanyShare | null | undefined): boolean {
  return !!share && (share.shot !== undefined || share.stock !== undefined);
}
