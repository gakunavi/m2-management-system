// ============================================
// ML管理システムが読み書きする案件ムーブメント（段階）
// ============================================
//
// ML の業務ムーブメント「MO受注」と、ライト事業の案件ムーブメントは同じ段階
// （2026-11-08 石井さん）。どちらで直しても同じ値にするため、状態・開始日・完了日を
// 双方向で開ける。代理店向けの表示はこれまでどおり営業管理システムのポータル。
//
// 段階の指定は **step_code**。ML は m2 の内部 id を持たないし、事業マスタの
// ムーブメント定義（`movement_templates`）で段階を足し引きしても ML 側の
// コードを直さずに済む（読み出しが step_code と名前を返す）。
//
// 開けていないもの（それぞれ理由がある）:
//   - `movement_notes`（メモ） … ML 側に相当する欄が無い。必要なら開ける
//   - 連動フィールド（`step_linked_field_key` が指す案件のカスタム項目） …
//     案件の PATCH（`custom_fields`）で直せる。段階からも書けるようにすると
//     同じ項目に2つの入口ができるので、入口は案件側の1つに絞る
//   - 段階そのものの追加・削除 … 事業マスタ（ムーブメント定義）の設定。
//     画面で管理者が決めるもので、案件ごとの値ではない
//
// 日付の扱い: m2 の保存先は timestamptz だが、画面の入力欄は日付のみ
// （`<input type="date">`）で、表示も ISO 文字列の日付部分をそのまま使っている。
// ML にも同じ `YYYY-MM-DD` で返す／受けることで、画面と ML がいつも同じ日付を
// 指すようにしている。

import { z } from 'zod';
import {
  MOVEMENT_STATUSES,
  MOVEMENT_STATUS_LABELS,
  type MovementStatus,
} from '@/lib/validations/movement';

/** 'YYYY-MM-DD' か null */
const dateOnly = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, '日付は YYYY-MM-DD 形式で指定してください')
  .nullable()
  .optional();

export const mlMovementPatchSchema = z
  .object({
    /** 段階の状態。pending / started / completed / skipped / unnecessary */
    status: z.enum(MOVEMENT_STATUSES).optional(),
    /** 開始日 */
    started_at: dateOnly,
    /** 完了日 */
    completed_at: dateOnly,
    /**
     * 楽観ロック。編集前に読んだその段階の `updated_at`。
     *
     * 案件・顧客は `version` だが、`project_movements` に version カラムが無いため
     * 担当者と同じく `updated_at` を使う。必須にしているのは、読まずに
     * 上書きされると「ML で直したのに画面の値に戻る」が起きるため。
     */
    updated_at: z.string().min(1, 'updated_at は編集前に読んだ値を指定してください'),
  })
  // 知らないキーは黙って捨てずに 422。ML 側のタイプミスを気づけるようにする
  .strict();

export type MlMovementPatchInput = z.infer<typeof mlMovementPatchSchema>;

/** ML が書き戻せるキーの一覧（仕様書とのドリフト検知に使う） */
export const ML_MOVEMENT_WRITABLE_KEYS = ['status', 'started_at', 'completed_at'] as const;

export interface MovementUpdateFieldsFromMl {
  movementStatus?: MovementStatus;
  movementStartedAt?: string | null;
  movementCompletedAt?: string | null;
}

/** ML のリクエストを共通更新処理（`applyMovementUpdate`）の入力へ変換する */
export function toMovementUpdateFields(input: MlMovementPatchInput): MovementUpdateFieldsFromMl {
  const fields: MovementUpdateFieldsFromMl = {};
  if (input.status !== undefined) fields.movementStatus = input.status;
  if (input.started_at !== undefined) fields.movementStartedAt = input.started_at;
  if (input.completed_at !== undefined) fields.movementCompletedAt = input.completed_at;
  return fields;
}

export interface MlMovementSource {
  movementStatus: string;
  movementStartedAt: Date | null;
  movementCompletedAt: Date | null;
  updatedAt: Date;
  template: {
    stepNumber: number;
    stepCode: string;
    stepName: string;
  };
}

/**
 * timestamptz → 'YYYY-MM-DD'。
 *
 * 画面の編集モーダル（`toDateInput`）と同じ「ISO の日付部分」。画面が日付入力で
 * 書いた値は UTC 0時で保存されるので往復して一致する。状態の切り替えだけで
 * 日付を自動セットした行は実時刻が入っているため、その UTC 日付を返す
 * （画面が表示している日付と同じ）。
 */
function toDateOnly(value: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

/**
 * ML へ返す段階1件。
 *
 * GET の items・PATCH のレスポンス・409 の `current` で同じ形を使う。
 * **キーは落とさない**（未入力は null）。
 */
export function buildMlMovementItem(row: MlMovementSource) {
  const status = row.movementStatus as MovementStatus;
  return {
    step_code: row.template.stepCode,
    step_name: row.template.stepName,
    step_number: row.template.stepNumber,
    status: row.movementStatus,
    status_label: MOVEMENT_STATUS_LABELS[status] ?? null,
    started_at: toDateOnly(row.movementStartedAt),
    completed_at: toDateOnly(row.movementCompletedAt),
    // version カラムが無いので updated_at を楽観ロックのトークンにする
    updated_at: row.updatedAt.toISOString(),
  };
}

/** レスポンスの item が必ず持つキー（テストと仕様書のドリフト検知に使う） */
export const ML_MOVEMENT_ITEM_KEYS = [
  'step_code', 'step_name', 'step_number',
  'status', 'status_label',
  'started_at', 'completed_at',
  'updated_at',
] as const;

/**
 * 選べる状態の一覧（`meta.status_options`）。
 *
 * 顧客の `industry_options` と同じ考え方で、ML が選択肢を自前で持たなくて済む
 * ようにする。m2 側で状態を増やしたら ML の入力欄にも自動で出る。
 */
export function movementStatusOptions(): Array<{ code: MovementStatus; label: string }> {
  return MOVEMENT_STATUSES.map((code) => ({ code, label: MOVEMENT_STATUS_LABELS[code] }));
}
