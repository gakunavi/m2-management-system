// ============================================
// ライト事業に「着金ステータス」を足す（本番 DB 用の単発スクリプト）
// ============================================
//
// 2026-11-09 石井さん「ML の業務ムーブメント『MO受注』の段階『購入代金の着金確認』と
// 両方向でそろえるため、営業案件に着金ステータスを足したい」
//
// ほかの書類のステータス（申込書・販売契約書・運用契約書）と同じ形にする:
//   select・必須でない・代理店に出さない・絞り込みに出さない。
//   置き場所は運用契約書ステータスの直後（書類のステータスが並んでいる所）。
//
// 画面（事業マスタ → 案件項目）と同じ書き込みをする:
//   `businesses.business_config.projectFields` を入れ替えて `version` を1つ上げる。
//   お客様のデータ（`projects.project_custom_data`）には触らない。
//
// 既定値の仕組みは作らない（2026-11-09 石井さん）。ほかの書類のステータスと同じで、
// 新しい案件の着金ステータスは空のまま。「3_請求書未送付」は選べる値として入るだけ。
//
// 使い方（本番は VPC 内からしか RDS に届かないので ECS の単発タスクで回す）:
//   sh scripts/run-prod-task.sh scripts/light-payment-status-field.js MODE=dump
//     MODE=dump   … 今の定義を出すだけ（戻すときの控え。docs/backups/ に残す）
//     MODE=dry    … 直した結果を出すだけ（書かない）
//     MODE=apply  … 書く
//     MODE=restore RESTORE_JSON=<projectFields の JSON> … 控えでそのまま戻す
//
// 事業は `INTEGRATION_BUSINESS_CODE`（既定 'LIGHT'）で引く。ML の口と同じ引き方。

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

/** 直後に入れる項目。ここが無ければ並びが想定と違うので何も書かない */
const ANCHOR = 'operation_contract_status';

/** 足す項目。JSON のキーの並びも既存の項目にそろえている */
const FIELD = {
  key: 'payment_status',
  type: 'select',
  label: '着金ステータス',
  options: ['1_着金済', '2_請求書送付済', '3_請求書未送付', '4_不要'],
  required: false,
  visibleToPartner: false,
};

/**
 * 今の定義（`projectFields`）から、着金ステータスを入れた新しい定義を作る。
 *
 * 画面の並び順（sortOrder 昇順。同じ値は今の配列順）を保ったまま差し込み、
 * 最後に 1 からの連番へ振り直す（今の定義は同じ sortOrder の重複が残っているため）。
 */
function buildNext(before) {
  const byKey = new Map(before.map((f) => [f.key, f]));

  // 書く前に確かめる。想定と違う状態で書くと画面から消える項目が出る
  if (!KEY_PATTERN.test(FIELD.key)) throw new Error(`キーの形式が不正です: ${FIELD.key}`);
  if (byKey.has(FIELD.key)) throw new Error(`${FIELD.key} は既にあります（二重に足さない）`);
  if (!byKey.has(ANCHOR)) throw new Error(`${ANCHOR} が見つかりません`);
  if (new Set(FIELD.options).size !== FIELD.options.length) {
    throw new Error('選べる値が重複しています');
  }

  const sorted = [...before].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const out = [];
  for (const field of sorted) {
    out.push(field);
    if (field.key === ANCHOR) out.push({ ...FIELD });
  }

  return out.map((f, i) => ({ ...f, sortOrder: i + 1 }));
}

module.exports = { buildNext, FIELD, ANCHOR };

// ここから下は実行したときだけ。テスト（tests/scripts/）は変換だけを取り出したいので
// `FIELD_SCRIPT_EXPORT_ONLY=1` を立ててから require する。
//
// **`require.main === module` では判定できない。** run-prod-task.sh はスクリプト本文を
// `node -e` に流し込み、そのとき `require.main` は undefined になる（vitest も undefined）。
// つまり `require.main === module` にすると本番で何もしないまま成功したように見える。
if (!process.env.FIELD_SCRIPT_EXPORT_ONLY) {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  (async () => {
    const mode = process.env.MODE || 'dump';
    const business = await prisma.business.findFirst({
      where: {
        businessCode: {
          equals: process.env.INTEGRATION_BUSINESS_CODE || 'LIGHT',
          mode: 'insensitive',
        },
      },
      select: { id: true, businessCode: true, version: true, businessConfig: true },
    });
    if (!business) throw new Error('ライト事業が見つかりません');

    const config = business.businessConfig || {};
    const before = config.projectFields || [];
    console.log(`MODE=${mode} BIZ=${business.id} VERSION=${business.version} COUNT=${before.length}`);
    console.log('BEFORE=' + JSON.stringify(before));
    if (mode === 'dump') return;

    const next = mode === 'restore' ? JSON.parse(process.env.RESTORE_JSON || '[]') : buildNext(before);
    if (mode === 'restore' && next.length === 0) throw new Error('RESTORE_JSON が空です');
    console.log('AFTER=' + JSON.stringify(next));
    console.log('AFTER_SUMMARY=' + JSON.stringify(next.map((f) => `${f.sortOrder}:${f.key}:${f.label}`)));
    if (mode === 'dry') return;
    if (mode !== 'apply' && mode !== 'restore') throw new Error(`MODE が不正です: ${mode}`);

    const updated = await prisma.business.update({
      where: { id: business.id },
      // 画面の PATCH と同じ: businessConfig の他のキーは残し、projectFields だけ入れ替える
      data: { businessConfig: { ...config, projectFields: next }, version: { increment: 1 } },
      select: { version: true },
    });
    console.log(`DONE NEW_VERSION=${updated.version} COUNT=${next.length}`);
  })()
    .catch((error) => {
      console.log('FATAL=' + (error && error.message));
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
