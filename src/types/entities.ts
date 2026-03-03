// ============================================
// Phase 0 エンティティ型（最小定義）
// ============================================


export type User = {
  id: number;
  userEmail: string;
  userName: string;
  userRole: 'admin' | 'staff' | 'partner_admin' | 'partner_staff';
  userPartnerId: number | null;
  userIsActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Business = {
  id: number;
  businessCode: string;
  businessName: string;
  businessDescription: string | null;
  businessIsActive: boolean;
  businessSortOrder: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type UserBusinessAssignment = {
  id: number;
  userId: number;
  businessId: number;
  assignmentRole: string;
  createdAt: string;
};

// ============================================
// Phase 1 エンティティ型
// ============================================

export type Industry = {
  id: number;
  industryName: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CustomerType = '法人' | '個人事業主' | '個人' | '確認中' | '未設定';

export type Customer = {
  id: number;
  customerCode: string;
  customerName: string;
  customerSalutation: string | null;
  customerType: CustomerType;
  customerPostalCode: string | null;
  customerAddress: string | null;
  customerPhone: string | null;
  customerFax: string | null;
  customerEmail: string | null;
  customerWebsite: string | null;
  industryId: number | null;
  industry: { id: number; industryName: string } | null;
  customerCorporateNumber: string | null;
  customerInvoiceNumber: string | null;
  customerCapital: number | null;
  customerEstablishedDate: string | null;
  customerFolderUrl: string | null;
  customerNotes: string | null;
  customerIsActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: number | null;
  updatedBy: number | null;
};

export type CustomerContactBusiness = {
  id: number;
  businessId: number;
  businessName: string;
  businessCode: string;
};

export type CustomerContact = {
  id: number;
  customerId: number;
  contactName: string;
  contactDepartment: string | null;
  contactPosition: string | null;
  contactIsRepresentative: boolean;
  contactPhone: string | null;
  contactFax: string | null;
  contactEmail: string | null;
  contactBusinessCardFrontUrl: string | null;
  contactBusinessCardBackUrl: string | null;
  contactIsPrimary: boolean;
  contactSortOrder: number;
  createdAt: string;
  updatedAt: string;
  businesses: CustomerContactBusiness[];
};

export type CustomerBusinessLink = {
  id: number;
  customerId: number;
  businessId: number;
  linkStatus: string;
  linkCustomData: Record<string, unknown>;
  businessName: string;
  businessCode: string;
  createdAt: string;
  updatedAt: string;
};
