// ============================================
// 顧客の更新処理（画面・ML連携の共通実装）
// ============================================
//
// `PATCH /api/v1/customers/[id]`（画面）と `PATCH /api/integrations/customers/[customer_code]`
// （ML管理システム）から同じ関数を呼ぶ。重複チェック・楽観ロック・事業別カスタム
// データのマージを2箇所に書かないため。
//
// 権限チェックは呼び出し側の責務（画面はロール、ML は受け付ける項目を絞る）。

import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '@/lib/error-handler';
import { updatedByFor, type UpdateActor } from '@/lib/update-actor';
import { notifyCustomerChangedToMl } from '@/lib/ml-scope';
import {
  MO_NO_KEY,
  moNoChangePatch,
  normalizeMoNo,
  resolveMoNoChange,
  type MoNoChange,
} from '@/lib/mo-number';

export const updateCustomerSchema = z.object({
  customerName: z.string().min(1).max(200).optional(),
  customerSalutation: z.string().max(100).optional().nullable(),
  customerType: z.enum(['法人', '個人事業主', '個人', '確認中', '未設定']).optional(),
  customerPostalCode: z.string().max(10).optional().nullable(),
  customerAddress: z.string().optional().nullable(),
  customerPhone: z.string().max(20).optional().nullable(),
  customerFax: z.string().max(20).optional().nullable(),
  customerEmail: z.string().email().optional().nullable().or(z.literal('')),
  customerWebsite: z.string().url().optional().nullable().or(z.literal('')),
  industryId: z.coerce.number().int().positive().optional().nullable(),
  customerCorporateNumber: z.string().max(100).optional().nullable().or(z.literal('')),
  customerInvoiceNumber: z.string().max(100).optional().nullable().or(z.literal('')),
  customerCapital: z.coerce.number().int().min(0).optional().nullable(),
  customerFiscalMonth: z.coerce.number().int().min(1).max(12).optional().nullable(),
  customerEstablishedDate: z.string().optional().nullable(),
  customerFolderUrl: z.string().url().optional().nullable().or(z.literal('')),
  customerNotes: z.string().optional().nullable(),
  customerIsActive: z.boolean().optional(),
  version: z.number().int().min(1),
});

export const CUSTOMER_INCLUDE = {
  industry: { select: { id: true, industryName: true } },
  contacts: {
    select: {
      id: true,
      contactName: true,
      contactDepartment: true,
      contactPosition: true,
      contactPhone: true,
      contactEmail: true,
      contactIsRepresentative: true,
      contactIsPrimary: true,
    },
    orderBy: { contactSortOrder: 'asc' },
  },
  businessLinks: {
    where: { linkStatus: 'active' },
    select: { businessId: true, linkCustomData: true },
  },
} as const;

export type UpdatedCustomer = Prisma.CustomerGetPayload<{ include: typeof CUSTOMER_INCLUDE }>;

export interface ApplyCustomerUpdateInput {
  customerId: number;
  /** スキーマ外のフィールド（linkCustomData / customerCustomData / businessId）も含む生のボディ */
  body: Record<string, unknown>;
  actor: UpdateActor;
}

/**
 * 顧客を1件更新する。
 *
 * - 楽観ロック（version 不一致 → 409）
 * - 名前＋電話番号の完全一致での重複チェック（自身を除く）
 * - `customerCustomData`（本体のグローバルカスタム項目）のマージ更新
 * - `linkCustomData`（事業別カスタム項目）のマージ更新。**businessId 必須**
 *   中間テーブル `customer_business_links` のデータなので、事業が分からないと書けない。
 * - MO番号（`linkCustomData.mo_no`）を変えたときは前の番号を履歴に残し、他の顧客と
 *   重複していれば 422（`src/lib/mo-number.ts`）
 */
export async function applyCustomerUpdate(
  prisma: PrismaClient,
  input: ApplyCustomerUpdateInput,
): Promise<UpdatedCustomer> {
  const { customerId, body, actor } = input;

  // linkCustomData / customerCustomData の更新リクエストを先に取り出す（スキーマ外）
  const linkCustomDataPatch = body.linkCustomData as Record<string, unknown> | undefined;
  const customerCustomDataPatch = body.customerCustomData as Record<string, unknown> | undefined;
  const linkBusinessId = body.businessId as number | undefined;

  const data = updateCustomerSchema.parse(body);

  // 楽観的ロック確認
  const current = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { version: true, customerIsActive: true, customerName: true, customerPhone: true, customerCustomData: true },
  });
  if (!current) throw ApiError.notFound('顧客が見つかりません');
  if (!current.customerIsActive) throw ApiError.notFound('顧客が見つかりません');
  if (current.version !== data.version) {
    throw ApiError.conflict('他のユーザーによって更新されています。画面をリロードしてください。');
  }

  // 名前+電話番号の完全一致 重複チェック（自身を除外）
  const checkName = data.customerName ?? current.customerName;
  const checkPhone = data.customerPhone !== undefined ? data.customerPhone : current.customerPhone;
  if (checkName && checkPhone) {
    const duplicate = await prisma.customer.findFirst({
      where: {
        id: { not: customerId },
        customerIsActive: true,
        customerName: checkName,
        customerPhone: checkPhone,
      },
      select: { id: true, customerCode: true, customerName: true },
    });
    if (duplicate) {
      throw ApiError.conflict(
        `同名+同電話番号の顧客が既に存在します（${duplicate.customerCode}: ${duplicate.customerName}）`,
      );
    }
  }

  // --- MO番号の変更は顧客本体の更新より前に検証する -----------------------
  // 422 を返すのに version を上げてしまうと、編集中のユーザーに意味のない 409 が出る。
  // 事業リンクはここで一度だけ読み、下の linkCustomData の更新でも使い回す。
  let existingLink: { id: number; linkCustomData: unknown } | null = null;
  let moNoChange: MoNoChange | null = null;
  if (linkCustomDataPatch && linkBusinessId) {
    existingLink = await prisma.customerBusinessLink.findUnique({
      where: { customerId_businessId: { customerId, businessId: linkBusinessId } },
      select: { id: true, linkCustomData: true },
    });
    if (existingLink) {
      moNoChange = await resolveMoNoChange(prisma, {
        businessId: linkBusinessId,
        customerId,
        linkCustomData: existingLink.linkCustomData,
        requested: linkCustomDataPatch[MO_NO_KEY],
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { version: _version, ...updateData } = data;

  const updated = await prisma.customer.update({
    where: { id: customerId },
    data: {
      ...updateData,
      customerCapital:
        updateData.customerCapital != null ? BigInt(updateData.customerCapital) : updateData.customerCapital,
      customerEstablishedDate:
        updateData.customerEstablishedDate ? new Date(updateData.customerEstablishedDate) : updateData.customerEstablishedDate,
      customerEmail: updateData.customerEmail !== undefined ? (updateData.customerEmail || null) : undefined,
      customerWebsite: updateData.customerWebsite !== undefined ? (updateData.customerWebsite || null) : undefined,
      customerCorporateNumber: updateData.customerCorporateNumber !== undefined ? (updateData.customerCorporateNumber || null) : undefined,
      customerInvoiceNumber: updateData.customerInvoiceNumber !== undefined ? (updateData.customerInvoiceNumber || null) : undefined,
      customerFolderUrl: updateData.customerFolderUrl !== undefined ? (updateData.customerFolderUrl || null) : undefined,
      ...(customerCustomDataPatch ? {
        customerCustomData: {
          ...((current.customerCustomData as Record<string, unknown>) ?? {}),
          ...customerCustomDataPatch,
        } as unknown as Prisma.InputJsonValue,
      } : {}),
      version: { increment: 1 },
      updatedBy: updatedByFor(actor),
    },
    include: CUSTOMER_INCLUDE,
  });

  // linkCustomData の更新（事業指定時のみ・リンクは上で読んである）
  if (linkCustomDataPatch && existingLink) {
    const existingData = (existingLink.linkCustomData as Record<string, unknown>) ?? {};
    await prisma.customerBusinessLink.update({
      where: { id: existingLink.id },
      data: {
        linkCustomData: {
          ...existingData,
          ...linkCustomDataPatch,
          // MO番号は前後の空白を落として保存する（空白混じりだと取り込みAPIが引けない）
          ...(MO_NO_KEY in linkCustomDataPatch
            ? { [MO_NO_KEY]: normalizeMoNo(linkCustomDataPatch[MO_NO_KEY]) }
            : {}),
          // 変えたときは前の番号を履歴に残す（取り込みAPIが前の番号でも引けるように）
          ...(moNoChange ? moNoChangePatch(moNoChange) : {}),
        } as unknown as Prisma.InputJsonValue,
      },
    });
    // 更新後の linkCustomData を反映するため businessLinks を再取得
    const freshLinks = await prisma.customerBusinessLink.findMany({
      where: { customerId, linkStatus: 'active' },
      select: { businessId: true, linkCustomData: true },
    });
    (updated as Record<string, unknown>).businessLinks = freshLinks;
  }

  // ML管理システムへ通知（ライト事業に紐づく顧客のみ・本文は customer_code だけ）。
  // ML 由来の更新は内側で弾かれる（ループ防止）
  await notifyCustomerChangedToMl(prisma, actor, { customerId, kind: 'customer' });

  return updated;
}
