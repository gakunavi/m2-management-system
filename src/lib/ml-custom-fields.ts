// ============================================
// カスタム項目（事業別の動的フィールド）の ML 向け入出力
// ============================================
//
// 顧客（`customer_business_links.link_custom_data` / `customers.customer_custom_data`）と
// 案件（`projects.project_custom_data`）で同じ扱いにするため、ここにまとめる。
// 片方だけ直すと「顧客は定義を返すのに案件は返さない」類のズレが出る。
//
// 決めごと:
//   - 返すのは**定義されている項目だけ**（m2 の画面に出ている項目）。
//     取り込みAPIが内部的に持たせているキー（`contact_roles`・`mo_no_history` など）は
//     画面に出ていないので返さない
//   - 未入力は null。**キーは落とさない**（ML が入力欄を固定で埋めるため）
//   - 値と定義はキー集合も並びも同じ（定義順）
//   - 書き込みは定義と突き合わせる。未定義キー・計算項目・型違いは 422

import { z } from 'zod';
import { ApiError } from '@/lib/error-handler';
import type { EntityFieldDefinition } from '@/types/dynamic-fields';

export const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** カスタム項目の値。型の妥当性は定義（EntityFieldDefinition）側で見る */
export const customFieldValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/** カスタム項目のパッチ（キー → 値） */
export const customFieldsPatch = z.record(customFieldValue);

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** 未入力・空文字は null に寄せる */
export function emptyToNull(value: unknown): unknown {
  return value === undefined || value === '' ? null : value;
}

/** 定義を画面の並び順にそろえる（値と定義で順を揃えるため1箇所にまとめる） */
export function sortByOrder(defs: EntityFieldDefinition[]): EntityFieldDefinition[] {
  return [...defs].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

/**
 * 定義されている項目だけを定義順に並べて返す。
 * 定義があって値が無いキーは null で埋める。
 */
export function pickDefinedFields(
  defs: EntityFieldDefinition[],
  data: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const def of sortByOrder(defs)) {
    out[def.key] = emptyToNull(data[def.key]);
  }
  return out;
}

/**
 * ML へ返すカスタム項目の定義1件。
 *
 * ML は画面の入力欄をこれで組む（名前・種類・選べる値）。m2 の事業マスタ・
 * システム設定で項目を増やしても ML 側のコードを直さずに済む。
 */
export interface MlCustomFieldDef {
  key: string;
  /** 画面に出る名前 */
  label: string;
  /** m2 の種類。text / textarea / number / date / month / select / checkbox / url / formula */
  type: EntityFieldDefinition['type'];
  /** select のときの選べる値。それ以外は null */
  options: string[] | null;
  /**
   * 計算項目（他の項目から計算される）か。
   * `type === 'formula'` と同じだが、ML が種類の一覧を知らなくても
   * 「入力させない」判定だけはできるように別で返す。書き込むと 422
   */
  is_formula: boolean;
  /** 画面に並べる順（値のオブジェクトもこの順に入っている） */
  sort_order: number;
}

/**
 * カスタム項目の定義を ML へ返す形にする。
 * 値（`pickDefinedFields`）と同じ並び・同じキー集合になる。
 */
export function buildFieldDefs(defs: EntityFieldDefinition[]): MlCustomFieldDef[] {
  return sortByOrder(defs).map((def) => ({
    key: def.key,
    label: def.label,
    type: def.type,
    options: def.type === 'select' && def.options && def.options.length > 0 ? def.options : null,
    is_formula: def.type === 'formula',
    sort_order: def.sortOrder ?? 0,
  }));
}

export interface AssertCustomFieldsOptions {
  /** エラーの field に出す接頭辞（'custom_fields' / 'global_custom_fields'） */
  scope: string;
  /**
   * 定義はあるが `custom_fields` からは受け付けないキー → 返すメッセージ。
   * 専用のトップレベルキーがある項目（MO番号・台数など）を2経路から書けないようにする。
   */
  readOnlyKeys?: Record<string, string>;
}

/**
 * カスタム項目への書き込みを定義と突き合わせる。
 *
 * - 定義に無いキー → 422（ML のタイプミス。黙って保存すると画面に出ない値が貯まる）
 * - 計算項目        → 422（入力値ではない。保存前の再計算で黙って消える）
 * - 専用キーがある項目 → 422（入口を1つに絞る）
 * - 型違い          → 422（数値項目に文字列、select に無い選択肢 など）
 */
export function assertCustomFieldsWritable(
  patch: Record<string, unknown>,
  defs: EntityFieldDefinition[],
  options: AssertCustomFieldsOptions,
): void {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const readOnly = options.readOnlyKeys ?? {};
  const errors: Array<{ field: string; message: string }> = [];
  const field = (key: string) => `${options.scope}.${key}`;

  for (const [key, value] of Object.entries(patch)) {
    if (key in readOnly) {
      errors.push({ field: field(key), message: readOnly[key] });
      continue;
    }

    const def = byKey.get(key);
    if (!def) {
      errors.push({
        field: field(key),
        message: `${key} は営業管理システムに登録されていない項目です`,
      });
      continue;
    }

    if (def.type === 'formula') {
      errors.push({
        field: field(key),
        message: `${def.label} は他の項目から計算される項目のため更新できません（計算元の項目を更新してください）`,
      });
      continue;
    }

    const typeError = checkCustomValue(def, value);
    if (typeError) errors.push({ field: field(key), message: typeError });
  }

  if (errors.length > 0) throw ApiError.badRequest('カスタム項目の値が不正です', errors);
}

/** 定義の型に対して値が妥当か。問題なければ null */
function checkCustomValue(def: EntityFieldDefinition, value: unknown): string | null {
  // null / 空文字はどの型でも「空にする」
  if (value === null || value === '') return null;

  switch (def.type) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? null
        : `${def.label}は数値で指定してください`;
    case 'checkbox':
      return typeof value === 'boolean' ? null : `${def.label}は true / false で指定してください`;
    case 'select':
      if (typeof value !== 'string') return `${def.label}は文字列で指定してください`;
      if (def.options && def.options.length > 0 && !def.options.includes(value)) {
        return `${def.label}は次のいずれかで指定してください: ${def.options.join(' / ')}`;
      }
      return null;
    case 'date':
      return typeof value === 'string' && DATE_PATTERN.test(value)
        ? null
        : `${def.label}は YYYY-MM-DD 形式で指定してください`;
    case 'month':
      return typeof value === 'string' && MONTH_PATTERN.test(value)
        ? null
        : `${def.label}は YYYY-MM 形式で指定してください`;
    case 'url':
      if (typeof value !== 'string') return `${def.label}は文字列で指定してください`;
      return z.string().url().safeParse(value).success
        ? null
        : `${def.label}は http(s):// から始まるURLで指定してください`;
    default:
      return typeof value === 'string' ? null : `${def.label}は文字列で指定してください`;
  }
}

/** 空文字は null にして保存する（読み出しが null を返す形に合わせる） */
export function normalizeCustomPatch(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    out[key] = value === '' ? null : value;
  }
  return out;
}
