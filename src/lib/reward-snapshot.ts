import { z } from 'zod';
import {
  rewardSettingSchema,
  paymentTimingSchema,
  type PaymentTiming,
  type RewardSetting,
} from '@/lib/reward-slots';
import { companyShareSchema, type CompanyShare } from '@/lib/company-share';

// ============================================
// 手数料の凍結スナップショット
// ============================================
//
// 収益確定（Project.revenueConfirmedAt のセット）時点の「実効料率」を丸ごと
// 案件に焼き付けたもの。以後マスタ（事業デフォルト・代理店リンク）の料率を
// 変更しても、この案件の金額計算はスナップショットを参照するため動かない。
//
//   スナップショットあり → 凍結済み。マスタ変更の影響を受けない
//   スナップショットなし → 未凍結。マスタから毎回計算＝新しい料率が反映される
//
// ── 何を凍結し、何を凍結しないか ──
// 凍結するのは「料率と、料率の当て方の前提」だけ。
//   凍結する : 自社受取率 / 代理店支払率（階層の各段）/ 基準金額フィールド /
//              支払タイミング
//   凍結しない: 取扱高そのもの（案件のカスタムデータ）/ 消費税率
// 金額を凍結しないのは、受注金額の入力ミスを直したら数字も直ってほしいため。
// 料率改定と金額訂正は別物として扱う。
//
// 消費税率を凍結しないのは、税が明細書（事業×代理店×対象月）単位で小計に掛かる
// ものだからで、1通の明細書には複数案件の行が載る。案件ごとに違う税率を持たせても
// 合成できないため、税率は従来どおり事業設定を明細書単位で参照する。
//
// ── 案件別上書きとの関係 ──
// スナップショットは「事業デフォルト → 代理店 → 案件別上書き」を解決し切った
// 後の実効値。よって凍結後に案件別上書き（rewardOverride / companyShareOverride）
// を編集しても金額は動かない。確定後の訂正はスナップショットを直接編集する
// （案件詳細の報酬タブ / 管理者のみ）。

/** 階層1段ぶんの凍結値（担当代理店＝先頭、以降は上位代理店） */
export interface RewardSnapshotNode {
  partnerId: number;
  /** 案件に紐づく担当代理店か（先頭の1段だけ true） */
  isAssigned: boolean;
  /** この段へ支払うショット手数料。undefined＝この段には支払わない */
  shot?: RewardSetting;
  /** この段へ支払うストック手数料。undefined＝この段には支払わない */
  stock?: RewardSetting;
  /** 支払い対象月の決め方（代理店特例を解決済み） */
  paymentTiming: PaymentTiming;
  closingDay: number | null;
}

export interface RewardSnapshot {
  /** 構造のバージョン。将来スキーマを変えるときの読み分け用 */
  version: 1;
  /** 凍結した日時（ISO8601） */
  capturedAt: string;
  /** 凍結の理由。confirm=収益確定時の自動 / backfill=移行 / manual=管理者の手動訂正 */
  capturedBy: 'confirm' | 'backfill' | 'manual';
  /** 自社受取率（メーカーから自社に入る販売手数料）の実効値 */
  companyShare: CompanyShare;
  /** 担当代理店 → 最上位（1次代理店）の順。代理店が無い案件（自社直販）は空配列 */
  chain: RewardSnapshotNode[];
  /** 代理店支払手数料の基準金額フィールド */
  shotBaseField: string | null;
  stockBaseField: string | null;
  /** 自社受取率の基準金額フィールド（解決済み。報酬側と同じならその値が入る） */
  companyShareShotBaseField: string | null;
  companyShareStockBaseField: string | null;
}

// --- Zod スキーマ ---

const snapshotNodeSchema = z.object({
  partnerId: z.number().int(),
  isAssigned: z.boolean(),
  shot: rewardSettingSchema.optional(),
  stock: rewardSettingSchema.optional(),
  paymentTiming: paymentTimingSchema,
  closingDay: z.number().int().nullable(),
});

export const rewardSnapshotSchema = z.object({
  version: z.literal(1),
  capturedAt: z.string(),
  capturedBy: z.enum(['confirm', 'backfill', 'manual']),
  companyShare: companyShareSchema,
  chain: z.array(snapshotNodeSchema),
  shotBaseField: z.string().nullable(),
  stockBaseField: z.string().nullable(),
  companyShareShotBaseField: z.string().nullable(),
  companyShareStockBaseField: z.string().nullable(),
});

/**
 * 管理者による訂正の入力スキーマ（案件詳細の報酬タブから送られる）。
 * capturedAt / capturedBy はサーバ側で必ず打ち直すのでクライアントからは受け取らない。
 */
export const rewardSnapshotEditSchema = rewardSnapshotSchema.omit({
  capturedAt: true,
  capturedBy: true,
});

export type RewardSnapshotEdit = z.infer<typeof rewardSnapshotEditSchema>;

/**
 * 未知の JSON（DB の Json 値）を RewardSnapshot として安全に読む。
 *
 * 不正な形は null（＝未凍結扱い）にフォールバックする。壊れた JSON で
 * 金額計算を落とすより、マスタから計算し直したほうが実害が小さいため。
 */
export function parseRewardSnapshot(value: unknown): RewardSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const result = rewardSnapshotSchema.safeParse(value);
  return result.success ? result.data : null;
}

/**
 * スナップショットから、指定の代理店の段を引く。
 *
 * 見つからない（＝凍結後に案件の担当代理店を付け替えた等で階層が変わった）場合は
 * undefined を返す。呼び出し側はマスタから計算し直すこと。凍結の目的は
 * 「同じ構成のまま料率だけ動くのを防ぐ」ことなので、構成そのものが変わった段まで
 * 古い値で埋めると、実在しない代理店への支払いが残り続けてしまう。
 */
export function snapshotNodeFor(
  snapshot: RewardSnapshot | null | undefined,
  partnerId: number,
): RewardSnapshotNode | undefined {
  return snapshot?.chain.find((n) => n.partnerId === partnerId);
}

/**
 * 代理店ロールへ返すときに、自社受取率の部分を伏せたスナップショットを作る。
 *
 * 代理店に支払う手数料（chain）は本人に見せてよいが、自社がメーカーから
 * いくら受け取っているかは社内情報。visibleFinancials と同じ方針で、
 * キーは残したまま中身だけ空にする（レスポンスのキー集合を揃えるため）。
 */
export function visibleRewardSnapshot(
  snapshot: RewardSnapshot | null,
  canSeeCompanyRevenue: boolean,
): RewardSnapshot | null {
  if (!snapshot || canSeeCompanyRevenue) return snapshot;
  return {
    ...snapshot,
    companyShare: {},
    companyShareShotBaseField: null,
    companyShareStockBaseField: null,
  };
}
