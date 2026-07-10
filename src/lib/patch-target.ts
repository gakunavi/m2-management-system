// ============================================
// PATCH 先エンドポイントの解析
// ============================================
//
// インライン編集の PATCH 先は 3 種類ある:
//   1. 自分自身       `/customers/12`            → レスポンスで行を置換してよい
//   2. 子エンティティ `/customers/12/contacts/3` → 別スキーマなので行を置換してはいけない
//   3. 別エンティティ `/customers/12`（案件一覧から顧客を編集）→ 行を置換してはいけない
//
// 以前はこれを `updated.id === row.id` で判定していたため、
// 案件IDと顧客IDがたまたま一致すると（どちらも autoincrement なので普通に起きる）
// 案件の行が顧客オブジェクトで丸ごと置換され、表示が壊れていた。
// ID ではなくエンドポイントのパスで判定する。

/** URL のパスセグメント（複数形）→ config.entityType（単数形） */
const ENTITY_TYPE_BY_SEGMENT: Record<string, string> = {
  customers: 'customer',
  partners: 'partner',
  projects: 'project',
  businesses: 'business',
  tasks: 'task',
};

export interface PatchTarget {
  /** PATCH 先のエンティティ種別。未知のパスなら null */
  entityType: string | null;
  /** PATCH 先の親エンティティID。取得できなければ null */
  id: number | null;
  /** 子リソース（/contacts/3 等）への PATCH かどうか */
  isChild: boolean;
}

/**
 * `/customers/12/contacts/3?businessId=1` のようなエンドポイントを解析する。
 */
export function parsePatchTarget(endpoint: string): PatchTarget {
  const path = endpoint.split('?')[0];
  const segments = path.split('/').filter(Boolean);

  const entityType = ENTITY_TYPE_BY_SEGMENT[segments[0]] ?? null;
  const id = segments[1] !== undefined && /^\d+$/.test(segments[1]) ? Number(segments[1]) : null;

  return {
    entityType,
    id,
    isChild: segments.length > 2,
  };
}

/**
 * この PATCH が「一覧に表示されている行そのもの」を更新するかどうか。
 * true のときだけ、レスポンスで行全体を置換してよい。
 */
export function targetsListRow(
  target: PatchTarget,
  listEntityType: string,
  rowId: number,
): boolean {
  return target.entityType === listEntityType && target.id === rowId;
}
