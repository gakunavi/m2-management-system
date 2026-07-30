// ============================================
// 顧客コード採番（社内採番: CST-####）
// ============================================
//
// 外部システム側の顧客コード（customerExternalCode = "MO-##"）とは別軸。
// 前方一致 "CST-" で最大値を探すため、外部コードが customerCode に入ることはない前提。

interface CustomerCodeClient {
  customer: {
    findFirst(args: {
      where: { customerCode: { startsWith: string } };
      orderBy: { customerCode: 'desc' };
      select: { customerCode: true };
    }): Promise<{ customerCode: string } | null>;
  };
}

export async function generateCustomerCode(client: CustomerCodeClient): Promise<string> {
  const latest = await client.customer.findFirst({
    where: { customerCode: { startsWith: 'CST-' } },
    orderBy: { customerCode: 'desc' },
    select: { customerCode: true },
  });
  if (!latest) return 'CST-0001';
  const num = parseInt(latest.customerCode.replace('CST-', ''), 10);
  return `CST-${String(num + 1).padStart(4, '0')}`;
}
