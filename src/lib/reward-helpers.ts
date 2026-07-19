import type { PrismaClient } from '@prisma/client';
import { getRevenueAmount, getKpiDefinitions } from '@/lib/revenue-helpers';
import {
  parseRewardSlots,
  mergeRewardSlots,
  type RewardSetting,
  type RewardSlots,
} from '@/lib/reward-slots';

// ============================================
// 代理店報酬 計算エンジン
// ============================================
//
// ショット報酬（契約確定時に1回）とストック報酬（継続中は毎月）を計算する。
// - 報酬設定は RewardSlots（ショット/ストック × 直/間接）を3層マージで解決
//   （事業デフォルト rewardConfig.defaults → 代理店リンク rewardSlots → 案件 rewardOverride）
// - 2段オーバーライド: 案件の担当代理店に「直」、その親代理店に「間接」
// - 収益確定（revenueConfirmedAt）でショット発生＆ストック開始、解約（cancelledAt）で終了
// - 支払い対象月は 当月/翌月/翌々月/締め日 ルールで確定月から算出（代理店特例あり）
// - 金額は円未満切り捨て
//
// 中核（computeProjectEntries 以下）は DB 非依存の純粋関数でテストする。

export type PaymentTiming = 'same' | 'next' | 'next2' | 'closing';
export type RewardKind = 'shot' | 'stock';
export type RewardEntryType = 'direct' | 'indirect';

export interface RewardConfig {
  defaults: RewardSlots;
  shotBaseField: string | null; // ショット率の基準（確定金額）。null なら primary KPI の sourceField
  stockBaseField: string | null; // ストック率の基準（月額）
  taxRate: number; // 消費税率(%)。既定 10
  paymentTiming: PaymentTiming;
  closingDay: number | null;
}

/** 計算対象の案件（DB非依存。日付は JST の YYYY-MM / 日 に変換済み） */
export interface ProjectRewardInput {
  id: number;
  projectNo: string;
  customerName: string | null;
  partnerId: number | null; // 担当代理店（直紹介）
  projectExpectedCloseMonth: string | null;
  projectCustomData: unknown;
  revenueConfirmedMonth: string | null; // 収益確定月（YYYY-MM）。null=未確定
  revenueConfirmedDay: number | null; // 収益確定日の日（締め日判定用）
  cancelledMonth: string | null; // 解約月（YYYY-MM）。null=継続中
  stockTermMonths: number | null; // ストック固定期間（月数）。null=解約日まで
  rewardOverride: RewardSlots | null; // 案件別上書き
}

/** 代理店×事業リンク（報酬設定・支払いタイミング特例） */
export interface LinkRewardInput {
  partnerId: number;
  rewardSlots: RewardSlots | null;
  paymentTiming: PaymentTiming | null;
  closingDay: number | null;
}

/** 計算結果の1明細行 */
export interface ComputedRewardEntry {
  projectId: number;
  projectNo: string;
  customerName: string | null;
  rewardKind: RewardKind;
  entryType: RewardEntryType;
  partnerId: number; // 受取代理店
  sourcePartnerId: number | null; // 間接のとき、成果を出した担当代理店
  baseAmount: number; // 基準額（ショット=確定金額 / ストック=月額）
  rewardType: 'rate' | 'fixed';
  rate: number | null; // rate のときの率%
  rewardAmount: number; // 円未満切り捨て済み
  sourceMonth: string; // 発生月（ショット=確定月 / ストック=対象の各月）
  paymentMonth: string; // 支払い明細の対象月
}

// ============================================
// 月ヘルパー（YYYY-MM）
// ============================================

/** "YYYY-MM" に n ヶ月足す（n は負も可） */
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/** 月の比較（a<b:-1, a==b:0, a>b:1） */
export function compareMonth(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** その月の末日 */
export function lastDayOfMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * UTC の Date を JST の { month: 'YYYY-MM', day } に変換。
 * revenueConfirmedAt / cancelledAt は Timestamptz(UTC) で保存されるため、
 * 会計上の月は日本時間で判定する。
 */
export function toJstMonthDay(date: Date): { month: string; day: number } {
  const jst = new Date(date.getTime() + 9 * 3600 * 1000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth() + 1;
  const day = jst.getUTCDate();
  return { month: `${y}-${String(m).padStart(2, '0')}`, day };
}

/**
 * 発生月 → 支払い対象月を算出。
 * - same: 当月 / next: 翌月 / next2: 翌々月
 * - closing: 締め日以前(day<=closingDay)なら当月、超えたら翌月
 *   （ストックは末日基準で判定するため、締め日が末日でない限り翌月になる）
 */
export function applyPaymentTiming(
  sourceMonth: string,
  sourceDay: number,
  timing: PaymentTiming,
  closingDay: number | null,
): string {
  switch (timing) {
    case 'same':
      return sourceMonth;
    case 'next':
      return addMonths(sourceMonth, 1);
    case 'next2':
      return addMonths(sourceMonth, 2);
    case 'closing':
      if (closingDay != null && sourceDay <= closingDay) return sourceMonth;
      return addMonths(sourceMonth, 1);
  }
}

// ============================================
// 報酬設定の取得・適用
// ============================================

/** businessConfig から rewardConfig を取り出す（既定値付き） */
export function getRewardConfig(businessConfig: unknown): RewardConfig | null {
  const config = businessConfig as Record<string, unknown> | null;
  const rc = config?.rewardConfig as Record<string, unknown> | undefined;
  if (!rc) return null;

  const timingRaw = rc.paymentTiming;
  const timing: PaymentTiming =
    timingRaw === 'next' || timingRaw === 'next2' || timingRaw === 'closing'
      ? timingRaw
      : 'same';

  // shotBaseField 未指定なら primary KPI の sourceField を使う
  let shotBaseField = typeof rc.shotBaseField === 'string' ? rc.shotBaseField : null;
  if (!shotBaseField) {
    const kpis = getKpiDefinitions(businessConfig);
    const primary = kpis.find((k) => k.isPrimary) ?? kpis[0];
    shotBaseField = primary?.sourceField ?? null;
  }

  return {
    defaults: parseRewardSlots(rc.defaults),
    shotBaseField,
    stockBaseField: typeof rc.stockBaseField === 'string' ? rc.stockBaseField : null,
    taxRate: typeof rc.taxRate === 'number' ? rc.taxRate : 10,
    paymentTiming: timing,
    closingDay: typeof rc.closingDay === 'number' ? rc.closingDay : null,
  };
}

/** 報酬設定を基準額に適用（率→⌊base×率⌋ / 固定→⌊value⌋、円未満切り捨て） */
export function applyRewardSetting(setting: RewardSetting, baseAmount: number): number {
  if (setting.type === 'rate') {
    return Math.floor((baseAmount * setting.value) / 100);
  }
  return Math.floor(setting.value);
}

/** 消費税額（外税・切り捨て） */
export function calcTax(subtotal: number, taxRate: number): number {
  return Math.floor((subtotal * taxRate) / 100);
}

// ============================================
// 純粋計算：1案件の報酬明細
// ============================================

/** 直紹介ぶんのスロット解決（事業デフォルト→担当リンク→案件上書き） */
function resolveDirect(
  kind: RewardKind,
  config: RewardConfig,
  responsibleLink: LinkRewardInput | null,
  project: ProjectRewardInput,
): RewardSetting | undefined {
  const merged = mergeRewardSlots(config.defaults, responsibleLink?.rewardSlots, project.rewardOverride);
  return merged[kind]?.direct;
}

/** 間接ぶんのスロット解決（事業デフォルト→親リンク→案件上書き） */
function resolveIndirect(
  kind: RewardKind,
  config: RewardConfig,
  parentLink: LinkRewardInput | null,
  project: ProjectRewardInput,
): RewardSetting | undefined {
  const merged = mergeRewardSlots(config.defaults, parentLink?.rewardSlots, project.rewardOverride);
  return merged[kind]?.indirect;
}

/** その代理店の支払いタイミング（リンク特例→事業デフォルト） */
function timingFor(link: LinkRewardInput | null, config: RewardConfig): {
  timing: PaymentTiming;
  closingDay: number | null;
} {
  if (link?.paymentTiming) {
    return { timing: link.paymentTiming, closingDay: link.closingDay ?? config.closingDay };
  }
  return { timing: config.paymentTiming, closingDay: config.closingDay };
}

/**
 * ストックが有効な発生月の一覧を [rangeFrom, rangeTo] の範囲で返す。
 * 開始=確定月、終了=解約月（inclusive）または固定期間の末月。両方無ければ range 上限まで。
 */
export function getStockActiveMonths(
  project: ProjectRewardInput,
  rangeFrom: string,
  rangeTo: string,
): string[] {
  const start = project.revenueConfirmedMonth;
  if (!start) return [];

  // 終了月を決める（複数条件の最小）
  let end: string | null = null;
  if (project.stockTermMonths != null && project.stockTermMonths > 0) {
    end = addMonths(start, project.stockTermMonths - 1);
  }
  if (project.cancelledMonth != null) {
    // 解約月は最終有効月に含める
    end = end == null ? project.cancelledMonth : (compareMonth(end, project.cancelledMonth) <= 0 ? end : project.cancelledMonth);
  }

  const from = compareMonth(start, rangeFrom) >= 0 ? start : rangeFrom;
  const upperByEnd = end == null ? rangeTo : (compareMonth(end, rangeTo) <= 0 ? end : rangeTo);
  const to = upperByEnd;

  const months: string[] = [];
  let cur = from;
  while (compareMonth(cur, to) <= 0) {
    months.push(cur);
    cur = addMonths(cur, 1);
  }
  return months;
}

/**
 * 1案件の報酬明細を、発生月レンジ [sourceFrom, sourceTo] で計算する（純粋関数）。
 * ショット＝確定月がレンジ内なら1回。ストック＝有効な各発生月ぶん。
 */
export function computeProjectEntries(
  project: ProjectRewardInput,
  responsibleLink: LinkRewardInput | null,
  parentLink: LinkRewardInput | null,
  config: RewardConfig,
  sourceFrom: string,
  sourceTo: string,
): ComputedRewardEntry[] {
  const entries: ComputedRewardEntry[] = [];
  if (!project.revenueConfirmedMonth) return entries; // 未確定は対象外

  const responsiblePartnerId = project.partnerId;
  const parentPartnerId = parentLink?.partnerId ?? null;
  const directTiming = timingFor(responsibleLink, config);
  const indirectTiming = timingFor(parentLink, config);

  const revenueForField = {
    id: project.id,
    projectExpectedCloseMonth: project.projectExpectedCloseMonth,
    projectCustomData: project.projectCustomData,
  };

  const pushEntry = (
    kind: RewardKind,
    type: RewardEntryType,
    partnerId: number,
    sourcePartnerId: number | null,
    baseAmount: number,
    setting: RewardSetting,
    sourceMonth: string,
    paymentMonth: string,
  ) => {
    entries.push({
      projectId: project.id,
      projectNo: project.projectNo,
      customerName: project.customerName,
      rewardKind: kind,
      entryType: type,
      partnerId,
      sourcePartnerId,
      baseAmount,
      rewardType: setting.type,
      rate: setting.type === 'rate' ? setting.value : null,
      rewardAmount: applyRewardSetting(setting, baseAmount),
      sourceMonth,
      paymentMonth,
    });
  };

  // --- ショット（確定月に1回）---
  const confirmedMonth = project.revenueConfirmedMonth;
  if (compareMonth(confirmedMonth, sourceFrom) >= 0 && compareMonth(confirmedMonth, sourceTo) <= 0) {
    const shotBase = config.shotBaseField ? getRevenueAmount(revenueForField, config.shotBaseField) : 0;
    const confirmedDay = project.revenueConfirmedDay ?? lastDayOfMonth(confirmedMonth);

    const directSetting = resolveDirect('shot', config, responsibleLink, project);
    if (directSetting && responsiblePartnerId != null) {
      pushEntry('shot', 'direct', responsiblePartnerId, null, shotBase, directSetting, confirmedMonth,
        applyPaymentTiming(confirmedMonth, confirmedDay, directTiming.timing, directTiming.closingDay));
    }
    const indirectSetting = resolveIndirect('shot', config, parentLink, project);
    if (indirectSetting && parentPartnerId != null) {
      pushEntry('shot', 'indirect', parentPartnerId, responsiblePartnerId, shotBase, indirectSetting, confirmedMonth,
        applyPaymentTiming(confirmedMonth, confirmedDay, indirectTiming.timing, indirectTiming.closingDay));
    }
  }

  // --- ストック（有効な各発生月）---
  const stockDirect = resolveDirect('stock', config, responsibleLink, project);
  const stockIndirect = resolveIndirect('stock', config, parentLink, project);
  if (stockDirect || stockIndirect) {
    const stockBase = config.stockBaseField ? getRevenueAmount(revenueForField, config.stockBaseField) : 0;
    for (const month of getStockActiveMonths(project, sourceFrom, sourceTo)) {
      const day = lastDayOfMonth(month); // ストックは末日基準
      if (stockDirect && responsiblePartnerId != null) {
        pushEntry('stock', 'direct', responsiblePartnerId, null, stockBase, stockDirect, month,
          applyPaymentTiming(month, day, directTiming.timing, directTiming.closingDay));
      }
      if (stockIndirect && parentPartnerId != null) {
        pushEntry('stock', 'indirect', parentPartnerId, responsiblePartnerId, stockBase, stockIndirect, month,
          applyPaymentTiming(month, day, indirectTiming.timing, indirectTiming.closingDay));
      }
    }
  }

  return entries;
}

// ============================================
// DB ラッパー：事業ぶんの報酬明細を計算
// ============================================

/**
 * 事業の確定済み案件から、発生月レンジ [sourceFrom, sourceTo] の報酬明細を計算する。
 * 返り値は明細のフラットリスト（支払い月での集計・締めは呼び出し側 / 別Phase）。
 */
export async function calculateBusinessRewardEntries(
  prisma: PrismaClient,
  businessId: number,
  sourceFrom: string,
  sourceTo: string,
): Promise<ComputedRewardEntry[]> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { businessConfig: true },
  });
  if (!business) return [];
  const config = getRewardConfig(business.businessConfig);
  if (!config) return [];

  // 事業の全リンク（担当・親の解決用）
  const links = await prisma.partnerBusinessLink.findMany({
    where: { businessId },
    select: {
      partnerId: true,
      rewardSlots: true,
      paymentTiming: true,
      closingDay: true,
      businessParentId: true,
    },
  });
  const linkByPartner = new Map<number, (typeof links)[number]>();
  for (const l of links) linkByPartner.set(l.partnerId, l);

  const toLinkInput = (l: (typeof links)[number] | undefined): LinkRewardInput | null =>
    l
      ? {
          partnerId: l.partnerId,
          rewardSlots: parseRewardSlots(l.rewardSlots),
          paymentTiming: (l.paymentTiming as PaymentTiming | null) ?? null,
          closingDay: l.closingDay,
        }
      : null;

  // 確定済み案件を取得
  const projects = await prisma.project.findMany({
    where: { businessId, revenueConfirmedAt: { not: null }, projectIsActive: true },
    select: {
      id: true,
      projectNo: true,
      partnerId: true,
      projectExpectedCloseMonth: true,
      projectCustomData: true,
      revenueConfirmedAt: true,
      cancelledAt: true,
      stockTermMonths: true,
      rewardOverride: true,
      customer: { select: { customerName: true } },
    },
  });

  const result: ComputedRewardEntry[] = [];
  for (const p of projects) {
    const confirmed = p.revenueConfirmedAt ? toJstMonthDay(p.revenueConfirmedAt) : null;
    const cancelled = p.cancelledAt ? toJstMonthDay(p.cancelledAt) : null;

    const responsibleLink = p.partnerId != null ? toLinkInput(linkByPartner.get(p.partnerId)) : null;
    const rawResponsible = p.partnerId != null ? linkByPartner.get(p.partnerId) : undefined;
    const parentLink = rawResponsible?.businessParentId != null
      ? toLinkInput(linkByPartner.get(rawResponsible.businessParentId))
      : null;

    const input: ProjectRewardInput = {
      id: p.id,
      projectNo: p.projectNo,
      customerName: p.customer?.customerName ?? null,
      partnerId: p.partnerId,
      projectExpectedCloseMonth: p.projectExpectedCloseMonth,
      projectCustomData: p.projectCustomData,
      revenueConfirmedMonth: confirmed?.month ?? null,
      revenueConfirmedDay: confirmed?.day ?? null,
      cancelledMonth: cancelled?.month ?? null,
      stockTermMonths: p.stockTermMonths,
      rewardOverride: parseRewardSlots(p.rewardOverride),
    };

    result.push(...computeProjectEntries(input, responsibleLink, parentLink, config, sourceFrom, sourceTo));
  }
  return result;
}

// ============================================
// 支払い対象月での期間絞り込み（内部集計・締め共通）
// ============================================

/** 明細を支払い対象月(paymentMonth)が [fromMonth, toMonth] に入るものだけに絞り込む（純粋関数） */
export function filterEntriesByPaymentMonth(
  entries: ComputedRewardEntry[],
  fromMonth: string,
  toMonth: string,
): ComputedRewardEntry[] {
  return entries.filter(
    (e) => compareMonth(e.paymentMonth, fromMonth) >= 0 && compareMonth(e.paymentMonth, toMonth) <= 0,
  );
}

/**
 * 支払い対象月(paymentMonth)が [fromMonth, toMonth] に入る明細を計算する。
 *
 * calculateBusinessRewardEntries は「発生月(sourceMonth)」の範囲を受け取るが、
 * 支払いタイミング（翌々月・締め日）により発生月と支払い対象月は最大2ヶ月ずれる。
 * そのため発生月レンジは fromMonth の2ヶ月前まで広げて計算し、支払い対象月で絞り込む。
 * （支払い対象月は発生月より前になることはないため、発生月レンジの上限は toMonth で足りる）
 */
export async function getRewardEntriesForPeriod(
  prisma: PrismaClient,
  businessId: number,
  fromMonth: string,
  toMonth: string,
): Promise<ComputedRewardEntry[]> {
  const sourceFrom = addMonths(fromMonth, -2);
  const entries = await calculateBusinessRewardEntries(prisma, businessId, sourceFrom, toMonth);
  return filterEntriesByPaymentMonth(entries, fromMonth, toMonth);
}

// ============================================
// 締め（確定）スナップショット用ヘルパー（純粋関数）
// ============================================

/** 明細書1通ぶんの金額集計（直/間接/小計/税/総計）。全て円未満切り捨て前提の整数円。 */
export interface RewardStatementTotals {
  totalDirect: number;
  totalIndirect: number;
  subtotal: number;
  taxAmount: number;
  grandTotal: number;
}

/**
 * 対象代理店ぶんの明細行から明細書の金額を集計する（純粋関数）。
 * subtotal = 直 + 間接、taxAmount = calcTax(subtotal)（外税・切り捨て）、grandTotal = subtotal + tax。
 * 明細が空（¥0）でも 0 埋めの totals を返す（¥0 明細書も正当）。
 */
export function computeStatementTotals(
  entries: ComputedRewardEntry[],
  taxRate: number,
): RewardStatementTotals {
  let totalDirect = 0;
  let totalIndirect = 0;
  for (const e of entries) {
    if (e.entryType === 'direct') totalDirect += e.rewardAmount;
    else totalIndirect += e.rewardAmount;
  }
  const subtotal = totalDirect + totalIndirect;
  const taxAmount = calcTax(subtotal, taxRate);
  const grandTotal = subtotal + taxAmount;
  return { totalDirect, totalIndirect, subtotal, taxAmount, grandTotal };
}

/**
 * 支払明細書番号を採番する（純粋・決定的）。
 *
 * 採番方針: 連番カウンタ（採番テーブルやシーケンス）を新設せず、
 * `事業コード-YYYYMM-代理店コード` で決定的に導出する。
 * RewardStatement は @@unique([businessId, partnerId, periodMonth]) により
 * 「事業×代理店×対象月」が一意で、businessCode・partnerCode はいずれも DB 上ユニーク。
 * よってこの3要素から作る番号も自然に衝突せず、採番時の競合（シーケンス採番の
 * 同時実行・飛び番・二重採番）を原理的に回避できる。追加インフラ不要。
 * （連番形式が業務要件で必要になれば、将来カウンタ列を足して差し替え可能）
 *
 * 注: この採番規則は plan 5.「Phase 4 で確定」項目。ユーザー最終確認は未了。
 */
export function generateStatementNo(
  businessCode: string,
  periodMonth: string,
  partnerCode: string,
): string {
  const ym = periodMonth.replace('-', '');
  return `${businessCode}-${ym}-${partnerCode}`;
}
