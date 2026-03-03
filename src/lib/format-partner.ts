// ============================================
// 代理店レスポンス整形（共通）
// route.ts / [id]/route.ts で共用
// ============================================

export interface PartnerRow {
  id: number;
  partnerCode: string;
  partnerTier: string | null;
  partnerTierNumber: string | null;
  parentId: number | null;
  partnerName: string;
  partnerSalutation: string | null;
  partnerType: string;
  partnerPostalCode: string | null;
  partnerAddress: string | null;
  partnerPhone: string | null;
  partnerFax: string | null;
  partnerEmail: string | null;
  partnerWebsite: string | null;
  partnerEstablishedDate: Date | null;
  partnerCorporateNumber: string | null;
  partnerInvoiceNumber: string | null;
  partnerCapital: bigint | null;
  industryId: number | null;
  industry: { id: number; industryName: string } | null;
  parent?: { id: number; partnerCode: string; partnerName: string } | null;
  partnerBpFormUrl: string | null;
  partnerBpFormKey: string | null;
  partnerFolderUrl: string | null;
  partnerNotes: string | null;
  partnerIsActive: boolean;
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
    businessTier?: string | null;
    businessTierNumber?: string | null;
  }[];
}

/**
 * 代理店レスポンスを整形する
 * @param p - Prisma からの代理店データ
 * @param targetBusinessId - 指定時、事業別の階層情報で partnerTier/partnerTierNumber を上書き
 */
export function formatPartner(p: PartnerRow, targetBusinessId?: number) {
  const representative = p.contacts?.find((ct) => ct.contactIsRepresentative) ?? null;
  const primaryContact = p.contacts?.find((ct) => ct.contactIsPrimary) ?? null;

  // 事業別階層のオーバーライド
  let displayTier = p.partnerTier;
  let displayTierNumber = p.partnerTierNumber;
  if (targetBusinessId && p.businessLinks) {
    const bizLink = p.businessLinks.find((bl) => bl.businessId === targetBusinessId);
    if (bizLink) {
      displayTier = bizLink.businessTier ?? p.partnerTier;
      displayTierNumber = bizLink.businessTierNumber ?? p.partnerTierNumber;
    }
  }

  // contacts, parent, businessLinks を除外して新しいオブジェクトを構築
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { contacts: _contacts, parent: _parent, businessLinks: _businessLinks, partnerEstablishedDate, partnerCapital, createdAt, updatedAt, partnerTier: _tier, partnerTierNumber: _tierNum, ...rest } = p;

  return {
    ...rest,
    partnerTier: displayTier,
    partnerTierNumber: displayTierNumber,
    partnerEstablishedDate: partnerEstablishedDate?.toISOString().split('T')[0] ?? null,
    partnerCapital: partnerCapital != null ? Number(partnerCapital) : null,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    parentPartnerCode: p.parent?.partnerCode ?? null,
    parentPartnerName: p.parent?.partnerName ?? null,
    representativeId: representative?.id ?? null,
    representativeName: representative?.contactName ?? null,
    representativePosition: representative?.contactPosition ?? null,
    primaryContactId: primaryContact?.id ?? null,
    primaryContactName: primaryContact?.contactName ?? null,
    primaryContactDepartment: primaryContact?.contactDepartment ?? null,
    primaryContactPhone: primaryContact?.contactPhone ?? null,
    primaryContactEmail: primaryContact?.contactEmail ?? null,
    businessLinkIds: p.businessLinks?.map((bl) => bl.businessId) ?? [],
  };
}
