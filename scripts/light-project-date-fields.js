// ============================================
// ライト事業の案件カスタム項目を直す（本番 DB 用の単発スクリプト）
// ============================================
//
// 2026-11-07 石井さん「両方中企庁になおそう」「日付はどちらのシステムにも必要」
//
//   1. `tax_incentive_status` の画面の名前を「強化税制ステータス」→「中企庁ステータス」
//      （キー・選べる値・お客様のデータは変えない）
//   2. 工業会5件・中企庁3件の日付項目を足す
//
// 画面（事業マスタ → 案件項目）と同じ書き込みをする:
//   `businesses.business_config.projectFields` を入れ替えて `version` を1つ上げる。
//   お客様のデータ（`projects.project_custom_data`）には触らない。
//
// 使い方（本番は VPC 内からしか RDS に届かないので ECS の単発タスクで回す）:
//   MODE=dump   … 今の定義を出すだけ（戻すときの控え）
//   MODE=dry    … 直した結果を出すだけ（書かない）
//   MODE=apply  … 書く
//   MODE=restore RESTORE_JSON=<projectFields の JSON> … 控えでそのまま戻す

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const RENAME = { key: 'tax_incentive_status', from: '強化税制ステータス', to: '中企庁ステータス' };

// 足す日付項目。anchor の項目の直後にこの順で入れる
const ADDITIONS = [
  { anchor: 'industry_assoc_status', fields: [
    ['industry_assoc_request_date', '工業会 依頼日'],
    ['industry_assoc_application_date', '工業会 申請日'],
    ['industry_assoc_received_date', '工業会 受領日'],
    ['industry_assoc_fee_payment_date', '工業会 発行費用の支払日'],
    ['industry_assoc_original_mailed_date', '工業会 原本の郵送日'],
  ] },
  { anchor: 'tax_incentive_status', fields: [
    ['sme_agency_shared_date', '中企庁 共有日'],
    ['sme_agency_application_date', '中企庁 申請日'],
    ['sme_agency_approval_date', '中企庁 認定日'],
  ] },
];

function buildNext(before) {
  const byKey = new Map(before.map((f) => [f.key, f]));

  // 直す前に確かめる。間違ったまま書くと画面から消える項目が出る
  if (!byKey.has(RENAME.key)) throw new Error(`${RENAME.key} が見つかりません`);
  if (byKey.get(RENAME.key).label !== RENAME.from && byKey.get(RENAME.key).label !== RENAME.to) {
    throw new Error(`${RENAME.key} の名前が想定と違います: ${byKey.get(RENAME.key).label}`);
  }
  for (const { anchor, fields } of ADDITIONS) {
    if (!byKey.has(anchor)) throw new Error(`${anchor} が見つかりません`);
    for (const [key] of fields) {
      if (!KEY_PATTERN.test(key)) throw new Error(`キーの形式が不正です: ${key}`);
      if (byKey.has(key)) throw new Error(`${key} は既にあります（二重に足さない）`);
    }
  }

  // 画面の並び順（sortOrder 昇順。同じ値は今の配列順）を保ったまま入れ替える
  const sorted = [...before].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const out = [];
  for (const field of sorted) {
    out.push(field.key === RENAME.key ? { ...field, label: RENAME.to } : field);
    const add = ADDITIONS.find((a) => a.anchor === field.key);
    if (add) {
      for (const [key, label] of add.fields) {
        out.push({ key, label, type: 'date', required: false, sortOrder: 0, visibleToPartner: false });
      }
    }
  }

  // 連番に振り直す（今の定義は 25・26 が欠番で 28・29 が重複している）
  return out.map((f, i) => ({ ...f, sortOrder: i + 1 }));
}

(async () => {
  const mode = process.env.MODE || 'dump';
  const business = await prisma.business.findFirst({
    where: { businessCode: { equals: process.env.INTEGRATION_BUSINESS_CODE || 'LIGHT', mode: 'insensitive' } },
    select: { id: true, businessCode: true, version: true, businessConfig: true },
  });
  if (!business) throw new Error('ライト事業が見つかりません');

  const config = (business.businessConfig || {});
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
  .catch((error) => { console.log('FATAL=' + (error && error.message)); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
