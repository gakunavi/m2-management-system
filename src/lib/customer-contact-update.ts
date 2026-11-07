// ============================================
// 顧客担当者の作成・更新・削除（画面・ML連携の共通実装）
// ============================================
//
// `/api/v1/customers/[id]/contacts[/<contactId>]`（画面）と
// `/api/integrations/customers/[customer_code]/contacts[/<id>]`（ML管理システム）から
// 同じ関数を呼ぶ。主担当（contactIsPrimary）を1人までに保つ排他制御を2箇所に
// 書かないため。
//
// CustomerContact には version カラムが無いので、楽観ロックは `updatedAt` で行う
// （ML は編集前に読んだ updatedAt を送り、現在値と違えば 409）。

import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '@/lib/error-handler';
import type { UpdateActor } from '@/lib/update-actor';
import { notifyCustomerChangedToMl } from '@/lib/ml-scope';

export const createContactSchema = z.object({
  contactName: z.string().min(1, '担当者名は必須です').max(100),
  contactDepartment: z.string().max(100).optional().nullable(),
  contactPosition: z.string().max(100).optional().nullable(),
  contactIsRepresentative: z.boolean().default(false),
  contactPhone: z.string().max(20).optional().nullable(),
  contactMobile: z.string().max(20).optional().nullable(),
  contactFax: z.string().max(20).optional().nullable(),
  contactEmail: z.string().email().optional().nullable().or(z.literal('')),
  contactBusinessCardFrontUrl: z.string().max(500).optional().nullable().or(z.literal('')),
  contactBusinessCardBackUrl: z.string().max(500).optional().nullable().or(z.literal('')),
  contactIsPrimary: z.boolean().default(false),
  contactSortOrder: z.number().int().min(0).default(0),
  businessIds: z.array(z.number().int().positive()).default([]),
});

export const updateContactSchema = z.object({
  contactName: z.string().min(1).max(100).optional(),
  contactDepartment: z.string().max(100).optional().nullable(),
  contactPosition: z.string().max(100).optional().nullable(),
  contactIsRepresentative: z.boolean().optional(),
  contactPhone: z.string().max(20).optional().nullable(),
  contactMobile: z.string().max(20).optional().nullable(),
  contactFax: z.string().max(20).optional().nullable(),
  contactEmail: z.string().email().optional().nullable().or(z.literal('')),
  contactBusinessCardFrontUrl: z.string().max(500).optional().nullable().or(z.literal('')),
  contactBusinessCardBackUrl: z.string().max(500).optional().nullable().or(z.literal('')),
  contactIsPrimary: z.boolean().optional(),
  contactSortOrder: z.number().int().min(0).optional(),
  businessIds: z.array(z.number().int().positive()).optional(),
});

export const CONTACT_INCLUDE = {
  businessLinks: {
    include: {
      business: { select: { id: true, businessName: true, businessCode: true } },
    },
  },
} as const;

export interface ContactRow {
  id: number;
  customerId: number;
  contactName: string;
  contactDepartment: string | null;
  contactPosition: string | null;
  contactIsRepresentative: boolean;
  contactPhone: string | null;
  contactMobile: string | null;
  contactFax: string | null;
  contactEmail: string | null;
  contactBusinessCardFrontUrl: string | null;
  contactBusinessCardBackUrl: string | null;
  contactIsPrimary: boolean;
  contactSortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  businessLinks: Array<{
    business: { id: number; businessName: string; businessCode: string };
  }>;
}

/** 画面（/api/v1）向けの整形。ML 向けの整形は integrations 側で別に持つ */
export function formatContact(c: ContactRow) {
  return {
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    businesses: c.businessLinks.map((bl) => ({
      id: bl.business.id,
      businessId: bl.business.id,
      businessName: bl.business.businessName,
      businessCode: bl.business.businessCode,
    })),
    businessLinks: undefined,
  };
}

/** 担当者を1件作る。主担当を立てたら既存の主担当を降ろす（1人まで） */
export async function createCustomerContact(
  prisma: PrismaClient,
  customerId: number,
  body: unknown,
  actor: UpdateActor,
): Promise<ContactRow> {
  const data = createContactSchema.parse(body);

  const contact = await prisma.$transaction(async (tx) => {
    // 主担当の排他制御: 新規が主担当の場合、既存の主担当を解除
    if (data.contactIsPrimary) {
      await tx.customerContact.updateMany({
        where: { customerId, contactIsPrimary: true },
        data: { contactIsPrimary: false },
      });
    }

    const newContact = await tx.customerContact.create({
      data: {
        customerId,
        contactName: data.contactName,
        contactDepartment: data.contactDepartment ?? null,
        contactPosition: data.contactPosition ?? null,
        contactIsRepresentative: data.contactIsRepresentative,
        contactPhone: data.contactPhone ?? null,
        contactMobile: data.contactMobile ?? null,
        contactFax: data.contactFax ?? null,
        contactEmail: data.contactEmail || null,
        contactBusinessCardFrontUrl: data.contactBusinessCardFrontUrl || null,
        contactBusinessCardBackUrl: data.contactBusinessCardBackUrl || null,
        contactIsPrimary: data.contactIsPrimary,
        contactSortOrder: data.contactSortOrder,
      },
    });

    // 事業リンク作成
    if (data.businessIds.length > 0) {
      await tx.customerContactBusinessLink.createMany({
        data: data.businessIds.map((businessId) => ({
          contactId: newContact.id,
          businessId,
        })),
        skipDuplicates: true,
      });
    }

    return tx.customerContact.findUnique({
      where: { id: newContact.id },
      include: CONTACT_INCLUDE,
    });
  });

  if (!contact) throw new Error('担当者の作成に失敗しました');

  // ML管理システムへ通知（ML 由来の更新は内側で弾かれる＝ループ防止）
  await notifyCustomerChangedToMl(prisma, actor, { customerId, kind: 'contacts' });

  return contact as ContactRow;
}

export interface UpdateContactOptions {
  /**
   * 楽観ロック用。編集前に読んだ `updatedAt`（ISO 8601）。
   * 指定時に現在値と違えば 409。画面からの更新では渡していない
   * （インライン編集が1項目ずつなので、従来の挙動を変えない）。
   */
  expectedUpdatedAt?: string;
}

/** 担当者を1件更新する。主担当を立てたら既存の主担当を降ろす（1人まで） */
export async function updateCustomerContact(
  prisma: PrismaClient,
  customerId: number,
  contactId: number,
  body: unknown,
  actor: UpdateActor,
  options: UpdateContactOptions = {},
): Promise<ContactRow> {
  const existing = await prisma.customerContact.findFirst({
    where: { id: contactId, customerId },
  });
  if (!existing) throw ApiError.notFound('担当者が見つかりません');

  if (options.expectedUpdatedAt !== undefined) {
    assertContactNotStale(existing.updatedAt, options.expectedUpdatedAt);
  }

  const data = updateContactSchema.parse(body);

  const updated = await prisma.$transaction(async (tx) => {
    // 主担当の排他制御
    if (data.contactIsPrimary === true && !existing.contactIsPrimary) {
      await tx.customerContact.updateMany({
        where: { customerId, contactIsPrimary: true, id: { not: contactId } },
        data: { contactIsPrimary: false },
      });
    }

    const { businessIds, ...contactData } = data;

    await tx.customerContact.update({
      where: { id: contactId },
      data: {
        ...contactData,
        contactEmail: contactData.contactEmail || null,
        contactBusinessCardFrontUrl: contactData.contactBusinessCardFrontUrl || null,
        contactBusinessCardBackUrl: contactData.contactBusinessCardBackUrl || null,
      },
    });

    // 事業リンク差し替え（指定があった場合のみ）
    if (businessIds !== undefined) {
      await tx.customerContactBusinessLink.deleteMany({
        where: { contactId },
      });
      if (businessIds.length > 0) {
        await tx.customerContactBusinessLink.createMany({
          data: businessIds.map((bid) => ({
            contactId,
            businessId: bid,
          })),
          skipDuplicates: true,
        });
      }
    }

    return tx.customerContact.findUnique({
      where: { id: contactId },
      include: CONTACT_INCLUDE,
    });
  });

  if (!updated) throw new Error('担当者の更新に失敗しました');

  await notifyCustomerChangedToMl(prisma, actor, { customerId, kind: 'contacts' });

  return updated as ContactRow;
}

/** 担当者を1件消す（物理削除。事業リンクは onDelete: Cascade で消える） */
export async function deleteCustomerContact(
  prisma: PrismaClient,
  customerId: number,
  contactId: number,
  actor: UpdateActor,
  options: UpdateContactOptions = {},
): Promise<void> {
  const existing = await prisma.customerContact.findFirst({
    where: { id: contactId, customerId },
    select: { id: true, updatedAt: true },
  });
  if (!existing) throw ApiError.notFound('担当者が見つかりません');

  if (options.expectedUpdatedAt !== undefined) {
    assertContactNotStale(existing.updatedAt, options.expectedUpdatedAt);
  }

  await prisma.customerContact.delete({ where: { id: contactId } });

  await notifyCustomerChangedToMl(prisma, actor, { customerId, kind: 'contacts' });
}

/**
 * 担当者の楽観ロック判定。
 *
 * `updatedAt` はミリ秒まで持つが、JSON を往復すると丸めが入る実装もあるため
 * 「ミリ秒単位で一致」で見る（ISO 文字列の素朴な一致比較だと、同じ時刻でも
 * タイムゾーン表記の違いで落ちる）。
 */
export function assertContactNotStale(current: Date, expectedIso: string): void {
  const expected = new Date(expectedIso);
  if (Number.isNaN(expected.getTime())) {
    throw ApiError.badRequest('updatedAt は ISO 8601 形式で指定してください');
  }
  if (current.getTime() !== expected.getTime()) {
    throw ApiError.conflict('他のユーザーによって更新されています。最新データを取得してください。');
  }
}
