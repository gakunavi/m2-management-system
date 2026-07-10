/* eslint-disable @typescript-eslint/no-require-imports -- 本番イメージで素の Node が直接実行する CommonJS スクリプト */

/**
 * マイグレーションのベースライン化が必要かを判定する。
 *
 * 背景:
 *   旧マイグレーション29件は `db push` 等で本番へ適用されており、SQL自体に
 *   14テーブルの CREATE TABLE が存在しなかった。そのため、まっさらなDBに
 *   `migrate deploy` すると途中で `relation "projects" does not exist` で失敗し、
 *   ステージングや災害復旧用の環境を作れない状態だった。
 *
 *   これを解消するため、全マイグレーションを `0_init` 1件に集約した。
 *   ただし既存DB（本番）には `0_init` を実行してはいけない（テーブルが既にある）。
 *   「適用済み」として記録するだけでよい。
 *
 * 終了コード:
 *   0  … ベースライン化が必要（呼び出し側が `prisma migrate resolve --applied 0_init` を実行する）
 *   10 … 不要（まっさらなDB、またはベースライン済み）
 *   1  … 判定に失敗（呼び出し側は中断せず、そのまま migrate deploy に進んでよい）
 */

const { PrismaClient } = require('@prisma/client');

const BASELINE_MIGRATION = '0_init';

async function tableExists(prisma, tableName) {
  const rows = await prisma.$queryRaw`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = ${tableName}
  `;
  return rows.length > 0;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    // users が無ければ、まだ何も作られていない新規DB。
    // migrate deploy が 0_init をそのまま実行すればよい。
    if (!(await tableExists(prisma, 'users'))) {
      console.log('[baseline] 新規DBのためベースライン化は不要（0_init をそのまま適用します）');
      return 10;
    }

    // 既存DBだが履歴テーブルが無い（db push で作られた等）→ ベースライン化が必要
    if (!(await tableExists(prisma, '_prisma_migrations'))) {
      console.log('[baseline] 既存DBに履歴テーブルがありません。ベースライン化します');
      return 0;
    }

    const applied = await prisma.$queryRaw`
      SELECT 1 FROM _prisma_migrations
      WHERE migration_name = ${BASELINE_MIGRATION} AND finished_at IS NOT NULL
    `;
    if (applied.length > 0) {
      console.log('[baseline] ベースライン化済みです');
      return 10;
    }

    console.log('[baseline] 既存DBに 0_init が未記録です。適用済みとして記録します');
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error('[baseline] 判定に失敗しました:', error.message);
    process.exit(1);
  });
