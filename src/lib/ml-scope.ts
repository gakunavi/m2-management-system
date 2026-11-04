// ============================================
// ML連携の対象範囲（ライト事業）の判定と通知の入口
// ============================================
//
// 双方向に同期するのは `INTEGRATION_BUSINESS_CODE`（既定 LIGHT ＝ ライト事業）に
// 紐づく案件・その顧客・顧客の担当者だけ。ほかの事業のデータは ML に関係しないので
// 通知もしないし、ML からの書き込みも受け付けない（404）。
//
// 判定をここに集約する理由: 更新処理（案件・顧客・担当者）と ML 向けの読み書き
// エンドポイントの両方で同じ判定が必要で、別々に書くと「顧客だけ他事業に漏れる」
// 類の抜けが出る。

import type { PrismaClient } from '@prisma/client';
import { resolveImportBusiness } from '@/lib/customer-import';
import { logger } from '@/lib/logger';
import { queueMlNotification } from '@/lib/ml-notify';
import { mlWebhookConfig } from '@/lib/ml-notify';
import { isMlActor, type UpdateActor } from '@/lib/update-actor';

/** その案件（事業）が ML 連携の対象か */
export async function isIntegrationBusiness(businessId: number): Promise<boolean> {
  const business = await resolveImportBusiness();
  return business !== null && business.id === businessId;
}

export interface IntegrationCustomerScope {
  businessId: number;
  customerId: number;
  customerCode: string;
}

/**
 * 顧客コードから ML 連携対象の顧客を引く。
 *
 * ライト事業に紐づいていない顧客・無効化された顧客・存在しない顧客はすべて null
 * （呼び出し側は 404 にする。「ある/ない」を区別して返すと事業外の顧客の存在が分かる）。
 */
export async function findIntegrationCustomerByCode(
  prisma: PrismaClient,
  customerCode: string,
): Promise<IntegrationCustomerScope | null> {
  const business = await resolveImportBusiness();
  if (!business) {
    logger.error(
      '連携API: 対象事業を解決できません（INTEGRATION_BUSINESS_CODE を確認してください）',
      undefined,
      'ml-scope',
    );
    return null;
  }

  const customer = await prisma.customer.findFirst({
    where: {
      customerCode,
      customerIsActive: true,
      businessLinks: { some: { businessId: business.id, linkStatus: 'active' } },
    },
    select: { id: true, customerCode: true },
  });
  if (!customer) return null;

  return { businessId: business.id, customerId: customer.id, customerCode: customer.customerCode };
}

export interface IntegrationProjectScope {
  businessId: number;
  projectId: number;
  projectNo: string;
  customerId: number;
  customerCode: string;
}

/** 案件Noから ML 連携対象の案件を引く（事業外・論理削除済みは null） */
export async function findIntegrationProjectByNo(
  prisma: PrismaClient,
  projectNo: string,
): Promise<IntegrationProjectScope | null> {
  const business = await resolveImportBusiness();
  if (!business) {
    logger.error(
      '連携API: 対象事業を解決できません（INTEGRATION_BUSINESS_CODE を確認してください）',
      undefined,
      'ml-scope',
    );
    return null;
  }

  const project = await prisma.project.findFirst({
    where: { projectNo, businessId: business.id, projectIsActive: true },
    select: {
      id: true,
      projectNo: true,
      customer: { select: { id: true, customerCode: true } },
    },
  });
  if (!project) return null;

  return {
    businessId: business.id,
    projectId: project.id,
    projectNo: project.projectNo,
    customerId: project.customer.id,
    customerCode: project.customer.customerCode,
  };
}

// ============================================
// 通知の入口（更新処理から呼ぶ）
// ============================================
//
// いずれも「ML 由来の更新なら送らない」「env 未設定なら送らない」「ライト事業
// 以外なら送らない」を内側で判定する。呼び出し側は条件を持たない。

export async function notifyProjectChangedToMl(
  prisma: PrismaClient,
  actor: UpdateActor,
  target: { businessId: number; projectNo: string },
): Promise<void> {
  if (isMlActor(actor)) return;
  if (!mlWebhookConfig()) return;
  if (!(await isIntegrationBusiness(target.businessId))) return;
  await queueMlNotification(prisma, actor, {
    eventType: 'project.updated',
    projectNo: target.projectNo,
  });
}

/**
 * 顧客・顧客担当者の変更通知。
 *
 * 顧客がライト事業に紐づいているかは customer_business_links を見て決める
 * （中間テーブルなので、顧客単体では対象か判断できない）。
 */
export async function notifyCustomerChangedToMl(
  prisma: PrismaClient,
  actor: UpdateActor,
  target: { customerId: number; kind: 'customer' | 'contacts' },
): Promise<void> {
  if (isMlActor(actor)) return;
  if (!mlWebhookConfig()) return;

  const business = await resolveImportBusiness();
  if (!business) return;

  const customer = await prisma.customer.findFirst({
    where: {
      id: target.customerId,
      businessLinks: { some: { businessId: business.id, linkStatus: 'active' } },
    },
    select: { customerCode: true },
  });
  if (!customer) return;

  await queueMlNotification(prisma, actor, {
    eventType: target.kind === 'customer' ? 'customer.updated' : 'customer.contacts.updated',
    customerCode: customer.customerCode,
  });
}
