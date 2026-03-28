// ============================================
// 顧客レスポンス整形（共通）
// route.ts / [id]/route.ts で共用
// ============================================

export interface CustomerRow {
  id: number;
  customerCode: string;
  customerName: string;
  customerSalutation: string | null;
  customerType: string;
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
  customerCapital: bigint | null;
  customerEstablishedDate: Date | null;
  customerFolderUrl: string | null;
  customerFiscalMonth: number | null;
  customerNotes: string | null;
  customerCustomData?: unknown;
  customerIsActive: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: number | null;
  updatedBy: number | null;
  contacts?: {
    id: number;
    contactName: string;
    contactDepartment: string | null;
    contactPosition: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    contactIsRepresentative: boolean;
    contactIsPrimary: boolean;
  }[];
  businessLinks?: {
    businessId: number;
    linkCustomData?: unknown;
  }[];
}

export function formatCustomer(c: CustomerRow, businessId?: number) {
  const representative = c.contacts?.find((ct) => ct.contactIsRepresentative) ?? null;
  const primaryContact = c.contacts?.find((ct) => ct.contactIsPrimary) ?? null;

  // contacts, businessLinks を除外して新しいオブジェクトを構築
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { contacts: _contacts, businessLinks: _businessLinks, customerCapital, customerEstablishedDate, customerCustomData: _rawCustomData, createdAt, updatedAt, ...rest } = c;

  // グローバル customerCustomData のフラット展開
  const customerCustomData = (c.customerCustomData && typeof c.customerCustomData === 'object')
    ? c.customerCustomData as Record<string, unknown>
    : {};
  const flatCustom: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(customerCustomData)) {
    flatCustom[`customerGlobal_${key}`] = val;
  }

  // 事業指定時: その事業の linkCustomData を取得してフラット展開
  let linkCustomData: Record<string, unknown> = {};
  if (businessId && c.businessLinks) {
    const link = c.businessLinks.find((bl) => bl.businessId === businessId);
    if (link?.linkCustomData && typeof link.linkCustomData === 'object') {
      linkCustomData = link.linkCustomData as Record<string, unknown>;
      for (const [key, val] of Object.entries(linkCustomData)) {
        flatCustom[`customerLink_${key}`] = val;
      }
    }
  }

  return {
    ...rest,
    ...flatCustom,
    customerCapital: customerCapital !== null ? Number(customerCapital) : null,
    customerEstablishedDate: customerEstablishedDate?.toISOString().split('T')[0] ?? null,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    representativeId: representative?.id ?? null,
    representativeName: representative?.contactName ?? null,
    representativePosition: representative?.contactPosition ?? null,
    primaryContactId: primaryContact?.id ?? null,
    primaryContactName: primaryContact?.contactName ?? null,
    primaryContactDepartment: primaryContact?.contactDepartment ?? null,
    primaryContactPhone: primaryContact?.contactPhone ?? null,
    primaryContactEmail: primaryContact?.contactEmail ?? null,
    businessLinkIds: c.businessLinks?.map((bl) => bl.businessId) ?? [],
    customerCustomData,
    linkCustomData,
  };
}
