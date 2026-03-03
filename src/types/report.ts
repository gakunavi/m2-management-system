export interface ReportKpiSummary {
  kpiKey: string;
  label: string;
  unit: string;
  actual: number;
  projectCount: number;
}

export interface ReportStatusBreakdown {
  statusCode: string;
  statusLabel: string;
  statusColor: string | null;
  projectCount: number;
  amount: number;
}

export interface ReportProject {
  id: number;
  projectNo: string;
  customerName: string | null;
  projectSalesStatus: string;
  statusLabel: string | null;
  statusColor: string | null;
  amount: number;
  expectedCloseMonth: string | null;
}

export interface PartnerMonthlyReportResponse {
  month: string;
  businessId: number;
  businessName: string;
  kpiSummaries: ReportKpiSummary[];
  statusBreakdown: ReportStatusBreakdown[];
  projects: ReportProject[];
  totalProjectCount: number;
  totalAmount: number;
}
