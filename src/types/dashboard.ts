// ============================================
// Phase 4: ダッシュボード + 予実管理 型定義
// ============================================

// --- 売上計上ルール（後方互換） ---

export interface RevenueRecognition {
  statusCode: string;
  amountField: string;
  dateField: string;
}

// --- KPI 定義（複数KPI対応） ---

export interface KpiDefinition {
  key: string;
  label: string;
  unit: string;
  aggregation: 'sum' | 'count';
  sourceField: string | null;
  statusFilter: string | string[] | null;
  dateField: string;
  isPrimary: boolean;
  sortOrder: number;
}

// --- 売上目標 ---

export interface SalesTargetMonth {
  month: string;
  targetAmount: number;
  actualAmount: number;
  achievementRate: number | null;
  projectCount: number;
}

export interface SalesTargetResponse {
  businessId: number;
  year: number;
  kpiKey: string;
  kpiDefinition: KpiDefinition | null;
  months: SalesTargetMonth[];
  yearTotal: {
    targetAmount: number;
    actualAmount: number;
    achievementRate: number | null;
    projectCount: number;
  };
}

export interface SalesTargetBulkRequest {
  year: number;
  kpiKey: string;
  targets: {
    month: string;
    targetAmount: number;
  }[];
}

// --- ダッシュボード ---

export interface KpiChange {
  current: number;
  previous: number;
  changeType: 'positive' | 'negative' | 'neutral';
}

export interface KpiSummaryItem {
  kpiKey: string;
  label: string;
  unit: string;
  current: number;
  previous: number;
  changeRate: number;
  changeType: 'positive' | 'negative' | 'neutral';
  targetAmount: number;
  achievementRate: number;
}

export interface DashboardSummary {
  currentMonth: string;
  revenue: KpiChange & { changeRate: number };
  achievementRate: KpiChange & { changePoints: number };
  totalProjects: KpiChange & { change: number };
  wonProjects: KpiChange & { change: number };
  kpiSummaries?: KpiSummaryItem[];
  businessSummaries?: BusinessSummaryItem[];
}

export interface BusinessSummaryItem {
  businessId: number;
  businessName: string;
  actualAmount: number;
  targetAmount: number;
  achievementRate: number | null;
  projectCount: number;
}

export interface RevenueTrendMonth {
  month: string;
  monthLabel: string;
  targetAmount: number;
  actualAmount: number;
}

export interface RevenueTrendResponse {
  year: number;
  kpiKey: string;
  kpiLabel: string;
  kpiUnit: string;
  months: RevenueTrendMonth[];
}

export interface PipelineStatus {
  statusCode: string;
  statusLabel: string;
  statusColor: string;
  statusSortOrder: number;
  projectCount: number;
  totalAmount: number;
}

export interface PipelineResponse {
  statuses: PipelineStatus[];
  total: {
    projectCount: number;
    totalAmount: number;
  };
  kpiUnit?: string;
}

export interface PartnerRankingItem {
  rank: number;
  partnerId: number | null;
  partnerName: string;
  totalAmount: number;
  projectCount: number;
}

export interface PartnerRankingResponse {
  rankings: PartnerRankingItem[];
  kpiUnit?: string;
}

export interface ActivityItem {
  id: number;
  type: 'status_change' | 'created' | 'updated';
  projectId: number;
  projectNo: string;
  customerName: string;
  description: string;
  timestamp: string;
  userName: string;
}

export interface ActivityResponse {
  activities: ActivityItem[];
}

// --- 代理店ポータル ---

export interface PortalBusinessSummary {
  businessId: number;
  businessName: string;
  totalAmount: number;
  projectCount: number;
  wonProjectCount: number;
}

export interface PortalSummaryResponse {
  businesses: PortalBusinessSummary[];
  totals: {
    totalAmount: number;
    projectCount: number;
    wonProjectCount: number;
  };
}

export interface PortalProject {
  projectId: number;
  projectNo: string;
  customerName: string;
  businessName: string;
  projectSalesStatus: string;
  projectSalesStatusLabel: string;
  projectSalesStatusColor: string;
  projectExpectedCloseMonth: string | null;
  amount: number | null;
  projectAssignedUserName: string | null;
  updatedAt: string;
  customFields?: Record<string, unknown>;
}

export interface PortalFieldDefinition {
  key: string;
  label: string;
  type: string;
}
