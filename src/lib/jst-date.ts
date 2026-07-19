// ============================================
// JST(日本時間)基準の日付入力 ⇄ ISO 変換
// ============================================
//
// 報酬計算エンジン（reward-helpers の toJstMonthDay）は Timestamptz(UTC) を +9h して
// 「会計上の月・日」を JST で判定する。UI 側で <input type="date"> の値と ISO を
// 素朴に UTC で変換すると JST とズレ、JST早朝帯(00:00〜09:00)に確定した案件で
// 計上月が1ヶ月ずれる。表示・保存を JST に揃えるための共有ヘルパー。
//
// 例: JST 2026-07-01 08:00 に確定 = UTC 2026-06-30T23:00Z
//   - UTC素朴スライス → "2026-06-30"（誤：6月に見える）
//   - isoToJstDateInput → "2026-07-01"（正）

const JST_OFFSET_MS = 9 * 3600 * 1000;

/** UTC の ISO 文字列を JST の暦日(YYYY-MM-DD)へ変換する。null/空は空文字。 */
export function isoToJstDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  return new Date(t + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * JST の暦日(YYYY-MM-DD)を、その日の JST 0時に相当する UTC の ISO 文字列へ変換する。
 * 空文字/未指定は null。toJstMonthDay(+9h) で同じ暦日に戻るため round-trip 安全。
 */
export function jstDateInputToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
