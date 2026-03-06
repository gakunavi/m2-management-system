import type { PrismaClient } from '@prisma/client';

type PrismaTransactionClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/**
 * 案件番号を生成する。
 * 形式: {事業プレフィックス}-{4桁連番}
 * 例: MG-0001, SA-0023
 */
export async function generateProjectNo(
  prisma: PrismaTransactionClient,
  businessId: number
): Promise<string> {
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { businessCode: true },
  });

  const prefix = business.businessCode;

  const latest = await prisma.project.findFirst({
    where: { businessId },
    orderBy: { projectNo: 'desc' },
    select: { projectNo: true },
  });

  let nextNum = 1;
  if (latest?.projectNo) {
    const match = latest.projectNo.match(/-(\d+)$/);
    if (match) {
      nextNum = parseInt(match[1], 10) + 1;
    }
  }

  return `${prefix}-${String(nextNum).padStart(4, '0')}`;
}

/**
 * 案件作成時にムーブメントレコードを自動生成する。
 * 案件作成APIの $transaction 内で呼び出す。
 */
export async function createInitialMovements(
  tx: PrismaTransactionClient,
  projectId: number,
  businessId: number
): Promise<void> {
  const templates = await tx.movementTemplate.findMany({
    where: { businessId, stepIsActive: true },
    orderBy: { stepNumber: 'asc' },
    select: { id: true },
  });

  if (templates.length === 0) return;

  await tx.projectMovement.createMany({
    data: templates.map((t) => ({
      projectId,
      templateId: t.id,
      movementStatus: 'pending',
    })),
  });
}
