import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { parseRewardSlots, rewardSlotsSchema, type RewardSlots } from '@/lib/reward-slots';
import { companyShareSchema, parseCompanyShare, type CompanyShare } from '@/lib/company-share';

// ============================================
// PartnerBusinessLink の報酬フィールド 共通シリアライザ / バリデーション
// ============================================
//
// 代理店×事業リンクの手数料設定を API 応答/入力で扱うための共通定義。
//   rewardSlots       … 自社が代理店へ支払う手数料の上書き
//   companyShareSlots … メーカーから自社へ入る販売手数料（自社受取率）
//   paymentTiming等   … 支払い対象月の特例
//
// GET / POST / PATCH がこの1箇所を共有する。ルートごとに列挙すると、
// 片方への追加を忘れて「保存できるが読めない」「読めるが保存できない」が起きる。

export interface RewardLinkFields {
  rewardSlots: unknown;
  companyShareSlots: unknown;
  paymentTiming: string | null;
  closingDay: number | null;
}

export function serializeRewardLinkFields(link: RewardLinkFields) {
  return {
    rewardSlots: parseRewardSlots(link.rewardSlots),
    // null（未設定）と {}（設定したが空）を区別する。未設定なら事業デフォルトへ
    // フォールバックすることを画面で示すため
    companyShareSlots: link.companyShareSlots ? parseCompanyShare(link.companyShareSlots) : null,
    paymentTiming: link.paymentTiming,
    closingDay: link.closingDay,
  };
}

/** 手数料設定の入力バリデーション（create/update 共通） */
export const rewardLinkInputSchema = {
  rewardSlots: rewardSlotsSchema.nullable().optional(),
  companyShareSlots: companyShareSchema.nullable().optional(),
  paymentTiming: z.enum(['same', 'next', 'next2', 'closing']).nullable().optional(),
  closingDay: z.number().int().min(1).max(31).nullable().optional(),
};

interface RewardLinkInput {
  rewardSlots?: RewardSlots | null;
  companyShareSlots?: CompanyShare | null;
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
    // 受取率は「設定なし（事業デフォルトを使う）」に戻せる必要があるため、
    // rewardSlots のように {} へ丸めず SQL NULL を書く。
    // Prisma の nullable Json 列に SQL NULL を入れるには DbNull を渡す
    // （JsonNull は JSON の null リテラルになり、未設定と区別できなくなる）。
    ...(data.companyShareSlots !== undefined
      ? {
          companyShareSlots: (data.companyShareSlots ??
            Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
        }
      : {}),
    ...(data.paymentTiming !== undefined ? { paymentTiming: data.paymentTiming } : {}),
    ...(data.closingDay !== undefined ? { closingDay: data.closingDay } : {}),
  };
}

/**
 * 自社受取率を保存してよいリンクかを検証する（NG ならエラーメッセージを返す）。
 *
 * 受取率は「代理店グループ単位」で決まるため、値を持てるのは1次代理店のリンクだけ。
 * 案件の担当が2次・3次でも階層を最上位まで遡って1次代理店の値を使うので、
 * 2次以降に保存できてしまうと「入力したのに一切効かない設定」が残り、
 * なぜ金額が合わないのか誰も追えなくなる。入口で弾く。
 *
 * クリア（null）はどの段でも許可する。過去に誤って入った値を消せなくなるため。
 */
export function validateCompanyShareTier(
  companyShareSlots: CompanyShare | null | undefined,
  link: { businessTier: string | null; businessParentId: number | null },
): string | null {
  if (companyShareSlots == null) return null;
  // 親を持たない段＝階層の最上位。階層ラベル未設定のリンクも resolvePartnerChain 上は
  // 最上位として扱われるため許可する
  const isTop =
    link.businessParentId == null &&
    (link.businessTier == null || link.businessTier === '1次代理店');
  return isTop
    ? null
    : '自社受取率は1次代理店にのみ設定できます（メーカーとの手数料は代理店グループ単位で決まるため）';
}
