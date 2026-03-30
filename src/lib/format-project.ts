import type { Project, Customer, Partner, Business, User, BusinessStatusDefinition } from '@prisma/client';

type ProjectWithRelations = Project & {
  customer?: (Pick<Customer, 'id' | 'customerCode' | 'customerName' | 'customerFolderUrl' | 'customerSalutation' | 'customerType' | 'customerWebsite' | 'customerFiscalMonth'> & {
    contacts?: { contactName: string }[];
  }) | null;
  partner?: Pick<Partner, 'id' | 'partnerCode' | 'partnerName' | 'partnerFolderUrl' | 'partnerSalutation'> | null;
  business?: Pick<Business, 'id' | 'businessName'> | null;
  assignedUser?: Pick<User, 'id' | 'userName'> | null;
  statusDefinition?: Pick<BusinessStatusDefinition, 'statusLabel' | 'statusColor'> | null;
};

export function formatProject(project: ProjectWithRelations) {
  return {
    id: project.id,
    businessId: project.businessId,
    customerId: project.customerId,
    partnerId: project.partnerId,
    projectNo: project.projectNo,
    projectSalesStatus: project.projectSalesStatus,
    projectSalesStatusLabel: project.statusDefinition?.statusLabel ?? null,
    projectSalesStatusColor: project.statusDefinition?.statusColor ?? null,
    projectExpectedCloseMonth: project.projectExpectedCloseMonth,
    projectAssignedUserId: project.projectAssignedUserId,
    projectAssignedUserName: project.projectAssignedUserName,
    projectNotes: project.projectNotes,
    projectCustomData: project.projectCustomData,
    projectStatusChangedAt: project.projectStatusChangedAt?.toISOString() ?? null,
    projectIsActive: project.projectIsActive,
    portalVisible: project.portalVisible,
    version: project.version,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    createdBy: project.createdBy,
    updatedBy: project.updatedBy,
    customer: project.customer ?? null,
    partner: project.partner ?? null,
    business: project.business ?? null,
    assignedUser: project.assignedUser ?? null,
  };
}
