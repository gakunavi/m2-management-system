import type {
  AccountingPipeline,
  PipelineEntry,
  CommissionDistribution,
  Project,
  Customer,
  Partner,
  Business,
} from '@prisma/client';

type PipelineWithRelations = AccountingPipeline & {
  project?: (Pick<Project, 'id' | 'projectNo' | 'projectSalesStatus'> & {
    customer?: Pick<Customer, 'id' | 'customerName'> | null;
    partner?: Pick<Partner, 'id' | 'partnerName'> | null;
  }) | null;
  business?: Pick<Business, 'id' | 'businessName'> | null;
  entries?: (PipelineEntry & {
    distributions?: (CommissionDistribution & {
      partner?: Pick<Partner, 'id' | 'partnerCode' | 'partnerName'> | null;
    })[];
  })[];
};

export function formatAccountingPipeline(pipeline: PipelineWithRelations) {
  const entries = pipeline.entries?.map((entry) => ({
    id: entry.id,
    pipelineId: entry.pipelineId,
    entryDate: entry.entryDate.toISOString().split('T')[0],
    amount: Number(entry.amount),
    periodYear: entry.periodYear,
    periodMonth: entry.periodMonth,
    entryStatus: entry.entryStatus,
    entryMemo: entry.entryMemo,
    version: entry.version,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    createdBy: entry.createdBy,
    updatedBy: entry.updatedBy,
    distributionTotal: entry.distributions?.reduce(
      (sum, d) => sum + Number(d.commissionAmount),
      0
    ) ?? 0,
    distributions: entry.distributions?.map((d) => ({
      id: d.id,
      entryId: d.entryId,
      partnerId: d.partnerId,
      partnerName: d.partner?.partnerName ?? null,
      partnerCode: d.partner?.partnerCode ?? null,
      tier: d.tier,
      tierLabel: d.tierLabel,
      rateType: d.rateType,
      commissionRate: Number(d.commissionRate),
      commissionAmount: Number(d.commissionAmount),
      isManualOverride: d.isManualOverride,
      paymentDueDate: d.paymentDueDate?.toISOString().split('T')[0] ?? null,
      paymentStatus: d.paymentStatus,
      distributionMemo: d.distributionMemo,
    })) ?? [],
  })) ?? [];

  return {
    id: pipeline.id,
    projectId: pipeline.projectId,
    businessId: pipeline.businessId,
    revenueType: pipeline.revenueType,
    unitPrice: Number(pipeline.unitPrice),
    quantity: pipeline.quantity,
    totalAmount: Number(pipeline.totalAmount),
    billingCycle: pipeline.billingCycle,
    paymentMethod: pipeline.paymentMethod,
    operationStartDate: pipeline.operationStartDate?.toISOString().split('T')[0] ?? null,
    memo: pipeline.memo,
    pipelineIsActive: pipeline.pipelineIsActive,
    version: pipeline.version,
    createdAt: pipeline.createdAt.toISOString(),
    updatedAt: pipeline.updatedAt.toISOString(),
    createdBy: pipeline.createdBy,
    updatedBy: pipeline.updatedBy,
    project: pipeline.project ? {
      id: pipeline.project.id,
      projectNo: pipeline.project.projectNo,
      projectSalesStatus: pipeline.project.projectSalesStatus,
      customerName: pipeline.project.customer?.customerName ?? null,
      partnerName: pipeline.project.partner?.partnerName ?? null,
    } : null,
    business: pipeline.business ? {
      id: pipeline.business.id,
      businessName: pipeline.business.businessName,
    } : null,
    entries,
    latestEntryDate: entries.length > 0
      ? entries.reduce((latest, e) =>
          e.entryDate > latest ? e.entryDate : latest,
          entries[0].entryDate
        )
      : null,
    entryCount: entries.length,
  };
}
