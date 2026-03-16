import type { MovementStatus } from '@/lib/validations/movement';

// ムーブメント一覧API (GET /api/v1/projects/movements) のレスポンス型

export interface MovementItem {
  id: number;
  movementStatus: MovementStatus;
  movementStartedAt: string | null;
  movementCompletedAt: string | null;
  movementNotes: string | null;
  templateId: number;
  stepNumber: number;
  stepCode: string;
  stepName: string;
  /** 連動フィールドの現在値（APIから注入） */
  linkedFieldValue?: string | number | boolean | null;
}

export interface ProjectRow {
  id: number;
  projectNo: string;
  projectSalesStatus: string;
  projectSalesStatusLabel: string | null;
  projectSalesStatusColor: string | null;
  projectExpectedCloseMonth: string | null;
  projectAssignedUserName: string | null;
  projectNotes: string | null;
  projectNeeds: string | null;
  version: number;
  customerName: string | null;
  partnerName: string | null;
  movements: MovementItem[];
}

export interface StatusDef {
  statusCode: string;
  statusLabel: string;
  statusColor: string | null;
  statusSortOrder?: number;
  statusIsFinal?: boolean;
  statusIsLost?: boolean;
}

export interface TemplateHeader {
  id: number;
  stepNumber: number;
  stepCode: string;
  stepName: string;
  /** 連動する案件フィールドのキー */
  stepLinkedFieldKey?: string | null;
  /** 連動フィールドのラベル（表示用） */
  linkedFieldLabel?: string | null;
  /** 連動フィールドの型 */
  linkedFieldType?: string | null;
  /** 連動フィールドの選択肢（select型の場合） */
  linkedFieldOptions?: string[] | null;
}

export interface FilterableFieldDef {
  key: string;
  label: string;
  type: string;
  options?: string[];
}

export interface MovementOverviewResponse {
  success: boolean;
  data: ProjectRow[];
  meta: {
    total: number;
    templates: TemplateHeader[];
    statusDefinitions: StatusDef[];
    filterableFields?: FilterableFieldDef[];
  };
}

// 案件詳細API (GET /api/v1/projects/:id/movements) のレスポンス型

export interface MovementTemplate {
  id: number;
  stepNumber: number;
  stepCode: string;
  stepName: string;
  stepDescription: string | null;
  stepIsSalesLinked: boolean;
  stepLinkedStatusCode: string | null;
  stepLinkedFieldKey: string | null;
  visibleToPartner: boolean;
}

export interface DetailMovement {
  id: number;
  projectId: number;
  templateId: number;
  movementStatus: MovementStatus;
  movementStartedAt: string | null;
  movementCompletedAt: string | null;
  movementNotes: string | null;
  updatedAt: string;
  updatedBy: number | null;
  template: MovementTemplate & {
    linkedFieldLabel?: string | null;
    linkedFieldType?: string | null;
    linkedFieldOptions?: string[] | null;
  };
  /** 連動フィールドの現在値 */
  linkedFieldValue?: string | number | boolean | null;
}
