// ============================================
// 更新操作の実行者（画面のユーザー / ML管理システム）
// ============================================
//
// 案件・顧客・担当者の更新ロジックは画面（/api/v1/**）と ML 連携
// （/api/integrations/**）の両方から呼ばれる。更新処理そのものを
// 共有するために、「誰が更新したか」をこの型に押し出す。
//
// - 画面経由: m2 のログインユーザー。`updated_by` に user.id が入る
// - ML 経由: m2 のユーザーではないので `updated_by` には入れられない。
//   代わりに `integration_change_logs.actor_label` へ "ML：<利用者名>" を残す

import { NextRequest } from 'next/server';

/** ML からの変更者名に付ける接頭辞（変更履歴の表示で ML 由来だと分かるようにする） */
export const ML_ACTOR_PREFIX = 'ML：';

/** ML 利用者名を渡すヘッダー */
export const ML_ACTOR_HEADER = 'x-ml-user';

export type UpdateActor =
  | {
      kind: 'user';
      /** projects/customers の updated_by に入れる m2 のユーザーID */
      userId: number;
      role: string;
      actorLabel: string;
    }
  | {
      kind: 'integration';
      source: 'ml';
      /** 変更履歴に残す表示名（"ML：山田太郎"） */
      actorLabel: string;
      /**
       * 権限チェック用のロール。ML は社内スタッフ相当として扱う。
       * 管理者専用の操作（凍結スナップショットの訂正・自社取り分の上書き）は
       * ML のリクエストスキーマ自体が受け付けないため、admin は与えない。
       */
      role: 'staff';
    };

/** ML からの更新か（ループ防止・履歴の出し分けに使う） */
export function isMlActor(actor: UpdateActor): boolean {
  return actor.kind === 'integration' && actor.source === 'ml';
}

/** projects/customers の updated_by に入れる値（ML は m2 ユーザーではないので null） */
export function updatedByFor(actor: UpdateActor): number | null {
  return actor.kind === 'user' ? actor.userId : null;
}

export function userActor(user: { id: number; role: string; userName?: string | null }): UpdateActor {
  return {
    kind: 'user',
    userId: user.id,
    role: user.role,
    actorLabel: user.userName?.trim() || `user:${user.id}`,
  };
}

export type MlActorResult =
  | { ok: true; actor: UpdateActor }
  | { ok: false; errors: Array<{ field: string; message: string }> };

/**
 * HTTP ヘッダーの値は Latin-1 しか運べない（日本語をそのまま入れると送信時に
 * 落ちるか文字化けする）。そのため ML 利用者名は **UTF-8 のパーセントエンコード**
 * で受け取る: `X-ML-User: %E5%B1%B1%E7%94%B0%E5%A4%AA%E9%83%8E`。
 *
 * ASCII だけの名前はそのままでも通る（`%` を含まない値はデコードしても同じ）。
 */
function decodeActorName(raw: string): string | null {
  if (!raw.includes('%')) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    // 壊れたパーセントエンコードは黙って通さない（文字化けした名前を履歴に残さない）
    return null;
  }
}

/**
 * ML 利用者名のヘッダーから実行者を組み立てる。
 *
 * 名前は必須。「誰が直したか分からない変更」を営業管理システムに残さないため、
 * 欠けていたら 422 にする（呼び出し側のバグを黙って飲み込まない）。
 */
export function mlActorFromRequest(request: NextRequest): MlActorResult {
  const header = request.headers.get(ML_ACTOR_HEADER)?.trim() ?? '';
  const decoded = decodeActorName(header);
  if (decoded === null) {
    return {
      ok: false,
      errors: [
        {
          field: ML_ACTOR_HEADER,
          message: `${ML_ACTOR_HEADER} の値を UTF-8 のパーセントエンコードで指定してください（例: encodeURIComponent('山田太郎')）`,
        },
      ],
    };
  }
  const raw = decoded.trim();
  if (raw === '') {
    return {
      ok: false,
      errors: [{ field: ML_ACTOR_HEADER, message: `${ML_ACTOR_HEADER} ヘッダーに ML の利用者名を指定してください` }],
    };
  }
  // 変更履歴のカラムは VARCHAR(100)。接頭辞を足した長さで上限を見る
  const maxName = 100 - ML_ACTOR_PREFIX.length;
  if (raw.length > maxName) {
    return {
      ok: false,
      errors: [{ field: ML_ACTOR_HEADER, message: `${ML_ACTOR_HEADER} は ${maxName} 文字以内で指定してください` }],
    };
  }
  return {
    ok: true,
    actor: { kind: 'integration', source: 'ml', actorLabel: `${ML_ACTOR_PREFIX}${raw}`, role: 'staff' },
  };
}
