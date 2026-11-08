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
import { queueMlNotification, type MlEventType } from '@/lib/ml-notify';
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
  await notifyProjectEvent(prisma, actor, target, 'project.updated');
}

/**
 * 案件の段階（ムーブメント）の変更通知。
 *
 * 案件本体の `project.updated` と分けるのは、ML が読み直す口が別だから
 * （段階は `GET /api/integrations/projects/{project_no}/movements`）。
 * 顧客と担当者を `customer.updated` / `customer.contacts.updated` に
 * 分けているのと同じ理由。
 */
export async function notifyProjectMovementsChangedToMl(
  prisma: PrismaClient,
  actor: UpdateActor,
  target: { businessId: number; projectNo: string },
): Promise<void> {
  await notifyProjectEvent(prisma, actor, target, 'project.movements.updated');
}

async function notifyProjectEvent(
  prisma: PrismaClient,
  actor: UpdateActor,
  target: { businessId: number; projectNo: string },
  eventType: MlEventType,
): Promise<void> {
  if (isMlActor(actor)) return;
  if (!mlWebhookConfig()) return;
  if (!(await isIntegrationBusiness(target.businessId))) return;
  await queueMlNotification(prisma, actor, {
    eventType,
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

// ============================================
// まとめて通知する入口（作成・取り込み・一括操作から呼ぶ）
// ============================================
//
// 案件の新規作成・CSV取り込み・コピー・一括削除でも ML へ知らせる
// （2026-11-08 石井さん）。ML は知らせで来たまだ無い案件を、内諾・申請中・購入済み
// なら その場で入れる（それより前の状態は入れない）ので、作成の知らせが要る。
//
// **件数が何件あっても案件ごとに1通ずつ送る。** 1通にまとめると、ML 側は
// 「どれが変わったか」を自分で調べることになり、控え・再送の単位（1件＝1通）も
// 崩れる。送信そのものはレスポンス後に回るので、編集した人は待たない。
//
// 論理削除でも `project.updated` を送る（削除専用の種別は作っていない）。
// ML が読み直すと `404` になるので、そこで「消えた」と分かる。

/**
 * 案件IDの配列から、ライト事業の案件だけ1件ずつ通知する。
 *
 * 案件Noは呼び出し側に持たせず、ここで引く（CSV取り込みや一括削除は ID しか
 * 持っていないため）。**論理削除済みの案件も対象**（消したことを知らせるため
 * `projectIsActive` では絞らない）。
 */
export async function notifyProjectsChangedToMl(
  prisma: PrismaClient,
  actor: UpdateActor,
  projectIds: number[],
): Promise<void> {
  await notifyProjectsEvent(prisma, actor, projectIds, 'project.updated');
}

/** 段階（ムーブメント）の構成がまとめて変わったときの通知（定義の同期など） */
export async function notifyProjectsMovementsChangedToMl(
  prisma: PrismaClient,
  actor: UpdateActor,
  projectIds: number[],
): Promise<void> {
  await notifyProjectsEvent(prisma, actor, projectIds, 'project.movements.updated');
}

async function notifyProjectsEvent(
  prisma: PrismaClient,
  actor: UpdateActor,
  projectIds: number[],
  eventType: MlEventType,
): Promise<void> {
  if (isMlActor(actor)) return;
  if (!mlWebhookConfig()) return;
  if (projectIds.length === 0) return;

  const business = await resolveImportBusiness();
  if (!business) return;

  // 事業の判定はここで1回だけ（案件ごとに引くと取り込み件数ぶん問い合わせが増える）
  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds }, businessId: business.id },
    select: { projectNo: true },
  });

  for (const project of projects) {
    await queueMlNotification(prisma, actor, { eventType, projectNo: project.projectNo });
  }
}

/**
 * 顧客IDの配列から、ライト事業の顧客だけ1件ずつ通知する（CSV取り込み・一括削除）。
 *
 * 1件ずつの `notifyCustomerChangedToMl` を回しても同じだが、それだと顧客の数だけ
 * 事業の解決と問い合わせが走る。
 */
export async function notifyCustomersChangedToMl(
  prisma: PrismaClient,
  actor: UpdateActor,
  target: { customerIds: number[]; kind: 'customer' | 'contacts' },
): Promise<void> {
  if (isMlActor(actor)) return;
  if (!mlWebhookConfig()) return;
  if (target.customerIds.length === 0) return;

  const business = await resolveImportBusiness();
  if (!business) return;

  const customers = await prisma.customer.findMany({
    where: {
      id: { in: target.customerIds },
      businessLinks: { some: { businessId: business.id, linkStatus: 'active' } },
    },
    select: { customerCode: true },
  });

  const eventType = target.kind === 'customer' ? 'customer.updated' : 'customer.contacts.updated';
  for (const customer of customers) {
    await queueMlNotification(prisma, actor, { eventType, customerCode: customer.customerCode });
  }
}

/**
 * 顧客の事業リンクを作った・直した・消したときの通知。
 *
 * リンクそのものが「その顧客が ML から見えるかどうか」なので、
 * `notifyCustomerChangedToMl`（リンクがある顧客だけ通す）では**消したときに
 * 送れない**。ここでは事業IDで判定し、顧客コードはリンクを見ずに引く。
 */
export async function notifyCustomerLinkChangedToMl(
  prisma: PrismaClient,
  actor: UpdateActor,
  target: { businessId: number; customerId: number },
): Promise<void> {
  if (isMlActor(actor)) return;
  if (!mlWebhookConfig()) return;
  if (!(await isIntegrationBusiness(target.businessId))) return;

  const customer = await prisma.customer.findUnique({
    where: { id: target.customerId },
    select: { customerCode: true },
  });
  if (!customer) return;

  await queueMlNotification(prisma, actor, {
    eventType: 'customer.updated',
    customerCode: customer.customerCode,
  });
}
