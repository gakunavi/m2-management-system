import path from 'path';
import ExcelJS from 'exceljs';

// ============================================
// 支払明細書 xlsx 生成（Phase 5）
// ============================================
//
// 「支払明細書原本.xlsx」（見積書シート）をテンプレートとして読み込み、
// セルの値だけを差し替えて出力する。
//
// なぜテンプレートを都度読み込むか:
// - 導入済みの `xlsx`(SheetJS Community Edition) はスタイル・罫線を書き込めない
//   （実測: read→write のラウンドトリップだけで styles.xml が 68KB→1.6KB に消失）
// - `exceljs` でテンプレートを読み込み、値だけを差し替えることで既存の書式
//   （罫線・フォント・レイアウト）をそのまま保持する
//
// 明細行が固定18行（22〜39行目）を超える場合の扱い:
// - `exceljs` の `duplicateRow` で動的に行を増やすことを試したが、値は移動しても
//   結合セル（!merges）の範囲が追従しないバグを実測で確認した（罫線・結合が壊れる）。
//   そのため行の動的増減は行わない。18行を超える分は最終行に「ほか n件（合算）」として
//   合算表示する（金額の正確性は損なわれない。行ごとの内訳はWeb明細画面で確認可能）。

const TEMPLATE_PATH = path.join(process.cwd(), 'src/lib/templates/reward-statement-template.xlsx');
const SOURCE_SHEET_NAME = '見積書';
const ITEM_FIRST_ROW = 22;
const ITEM_MAX_ROWS = 18; // 22〜39行目

const KIND_LABELS = { shot: 'ショット', stock: 'ストック' } as const;
const ENTRY_TYPE_LABELS = { direct: '直紹介', indirect: '間接' } as const;

export interface RewardStatementXlsxEntry {
  projectNoSnapshot: string | null;
  customerNameSnapshot: string | null;
  rewardKind: 'shot' | 'stock';
  entryType: 'direct' | 'indirect';
  sourcePartnerName: string | null;
  rewardAmount: number;
}

export interface RewardStatementXlsxInput {
  statementNo: string | null;
  partnerName: string;
  partnerPostalCode: string | null;
  partnerAddress: string | null;
  periodMonth: string;
  subtotal: number;
  taxAmount: number;
  grandTotal: number;
  entries: RewardStatementXlsxEntry[];
}

function formatItemLabel(entry: RewardStatementXlsxEntry): string {
  const kind = KIND_LABELS[entry.rewardKind];
  const type = ENTRY_TYPE_LABELS[entry.entryType];
  const via = entry.entryType === 'indirect' && entry.sourcePartnerName ? `（${entry.sourcePartnerName} 経由）` : '';
  const project = entry.projectNoSnapshot ?? '-';
  const customer = entry.customerNameSnapshot ? ` ${entry.customerNameSnapshot}` : '';
  return `${project}${customer}（${kind}・${type}）${via}`;
}

/** 明細行を最大 ITEM_MAX_ROWS 行に収める。超過分は最終行に合算する */
function buildItemRows(
  entries: RewardStatementXlsxEntry[],
): Array<{ label: string; quantity: number; unitPrice: number; total: number }> {
  if (entries.length <= ITEM_MAX_ROWS) {
    return entries.map((e) => ({ label: formatItemLabel(e), quantity: 1, unitPrice: e.rewardAmount, total: e.rewardAmount }));
  }
  const shown = entries.slice(0, ITEM_MAX_ROWS - 1).map((e) => ({
    label: formatItemLabel(e),
    quantity: 1,
    unitPrice: e.rewardAmount,
    total: e.rewardAmount,
  }));
  const rest = entries.slice(ITEM_MAX_ROWS - 1);
  const restTotal = rest.reduce((sum, e) => sum + e.rewardAmount, 0);
  shown.push({ label: `ほか ${rest.length}件（合算・内訳はWeb明細画面参照）`, quantity: 1, unitPrice: restTotal, total: restTotal });
  return shown;
}

export async function generateRewardStatementXlsx(input: RewardStatementXlsxInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TEMPLATE_PATH);

  const sheet = workbook.getWorksheet(SOURCE_SHEET_NAME);
  if (!sheet) throw new Error(`テンプレートにシート「${SOURCE_SHEET_NAME}」が見つかりません`);

  // 元テンプレートは他用途のシート（契約書等）も同梱された社内マスタファイルのため、
  // 明細書には無関係な他シートは出力から除去する
  for (const ws of [...workbook.worksheets]) {
    if (ws.id !== sheet.id) workbook.removeWorksheet(ws.id);
  }
  sheet.name = '支払明細書';

  // 宛先（代理店）
  sheet.getCell('B5').value = input.partnerName ? `${input.partnerName} 御中` : '';
  if (input.partnerPostalCode) {
    sheet.getCell('B8').value = `〒${input.partnerPostalCode}`;
  }
  if (input.partnerAddress) {
    sheet.getCell('B9').value = input.partnerAddress;
  }

  // お支払い金額（テンプレートは =W43 の数式参照。確定済みスナップショットの値を
  // そのまま埋め込み、再計算に依存しないようにする）
  sheet.getCell('F15').value = input.grandTotal;

  // お振込年月日: 実際の振込予定日は本システムでは保持していないため空欄のまま
  // （運用側で手動記入を想定。将来的に支払予定日フィールドを持つ場合は要対応）

  // 明細行（22〜39行目、固定18行）
  const rows = buildItemRows(input.entries);
  rows.forEach((row, i) => {
    const r = ITEM_FIRST_ROW + i;
    sheet.getCell(`B${r}`).value = row.label;
    sheet.getCell(`N${r}`).value = row.quantity;
    sheet.getCell(`R${r}`).value = row.unitPrice;
    sheet.getCell(`W${r}`).value = row.total;
  });

  // 小計・消費税・合計（テンプレートの数式を確定値で上書き。切り捨て計算済みの
  // 値をそのまま使うことで、Excel側の再計算による端数のズレを防ぐ）
  sheet.getCell('W41').value = input.subtotal;
  sheet.getCell('W42').value = input.taxAmount;
  sheet.getCell('W43').value = input.grandTotal;

  // 備考: 明細書番号・対象月を記載（テンプレートの「備考」ラベル下の自由記入欄）
  const remarksCell = sheet.getCell('B42');
  remarksCell.value = `明細書番号: ${input.statementNo ?? '-'}\n対象月: ${input.periodMonth}`;
  remarksCell.alignment = { ...remarksCell.alignment, wrapText: true, vertical: 'top' };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
