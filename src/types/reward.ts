import type { RewardKind, RewardEntryType } from '@/lib/reward-helpers';

// ============================================
// 内部向け報酬集計画面（Phase 3）のレスポンス型
// ============================================

export interface RewardPartnerSummary {
  partnerId: number;
  partnerCode: string;
  partnerName: string;
  directTotal: number;
  indirectTotal: number;
  total: number;
  entryCount: number;
}

export interface RewardSummaryResponse {
  businessId: number;
  businessName: string;
  month: string;
  partners: RewardPartnerSummary[];
  grandTotal: {
    directTotal: number;
    indirectTotal: number;
    total: number;
  };
}

export interface RewardPreviewEntry {
  projectId: number;
  projectNo: string;
  customerName: string | null;
  rewardKind: RewardKind;
  entryType: RewardEntryType;
  sourcePartnerId: number | null;
  sourcePartnerName: string | null;
  baseAmount: number;
  rewardType: 'rate' | 'fixed';
  rate: number | null;
  rewardAmount: number;
  sourceMonth: string;
  paymentMonth: string;
}

export interface RewardPreviewResponse {
  businessId: number;
  partnerId: number;
  partnerName: string;
  month: string;
  entries: RewardPreviewEntry[];
  directTotal: number;
  indirectTotal: number;
  total: number;
}

// ============================================
// 締め・確定（Phase 4）のレスポンス型
// ============================================

export interface RewardStatementListItem {
  id: number;
  businessId: number;
  partnerId: number;
  partnerName: string;
  partnerCode: string;
  periodMonth: string;
  status: string;
  statementNo: string | null;
  totalDirect: number;
  totalIndirect: number;
  subtotal: number;
  taxAmount: number;
  grandTotal: number;
  confirmedAt: string | null;
  confirmedByName: string | null;
}

export interface RewardStatementEntryDetail {
  id: number;
  projectId: number | null;
  projectNoSnapshot: string | null;
  customerNameSnapshot: string | null;
  rewardKind: RewardKind;
  entryType: RewardEntryType;
  sourcePartnerId: number | null;
  sourcePartnerName: string | null;
  sourceMonth: string;
  baseAmount: number;
  rewardType: 'rate' | 'fixed';
  rate: number | null;
  rewardAmount: number;
}

export interface RewardStatementDetail extends RewardStatementListItem {
  businessName: string;
  entries: RewardStatementEntryDetail[];
}

// ============================================
// 代理店ポータルの報酬表示（Phase 6）のレスポンス型
// ============================================

export interface PortalRewardLiveEntry {
  projectNo: string;
  customerName: string | null;
  partnerName: string;
  rewardKind: RewardKind;
  entryType: RewardEntryType;
  sourcePartnerName: string | null;
  rewardAmount: number;
}

export interface PortalRewardConfirmedStatement {
  id: number;
  partnerName: string;
  periodMonth: string;
  totalDirect: number;
  totalIndirect: number;
  grandTotal: number;
  confirmedAt: string | null;
}

export interface PortalRewardResponse {
  businessId: number;
  month: string;
  live: {
    directTotal: number;
    indirectTotal: number;
    total: number;
    entries: PortalRewardLiveEntry[];
  };
  confirmedStatements: PortalRewardConfirmedStatement[];
}

// ============================================
// 収益確定日 未設定チェック（締め前の警告）
// ============================================
// 営業ステータスは「収益確定」対象(isRevenueConfirmed=true)なのに
// revenueConfirmedAt が未設定の案件。報酬計算から静かに除外されるため、
// 締め（確定）前に気づけるよう警告表示する。

export interface RewardConfirmationWarning {
  projectId: number;
  projectNo: string;
  customerName: string | null;
  statusCode: string;
  statusLabel: string;
}
