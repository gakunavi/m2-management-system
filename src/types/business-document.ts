export type DocumentType = 'material' | 'invoice';

export interface BusinessDocument {
  id: number;
  businessId: number;
  partnerId: number | null;
  documentType: DocumentType;
  documentTitle: string;
  fileName: string;
  fileStorageKey: string;
  fileUrl: string;
  fileSize: number;
  fileMimeType: string;
  targetMonth: string | null;
  documentDescription: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: number | null;
  lastNotifiedAt: string | null;
  lastNotifiedBy: number | null;
  creator?: {
    id: number;
    userName: string;
  } | null;
  partner?: {
    id: number;
    partnerName: string;
  } | null;
}
