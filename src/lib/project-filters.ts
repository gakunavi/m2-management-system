/**
 * 案件（契約マスタ）の絞り込み条件を組み立てる共通ロジック。
 *
 * 一覧 API（GET /api/v1/projects）と CSV エクスポート API
 * （GET /api/v1/projects/csv）の双方から呼び出す。以前は両者が個別に
 * searchParams を読んでいたため CSV 側だけ対応フィルターが少なく、
 * 「画面で絞り込んでもエクスポートは全件」という状態になっていた。
 *
 * ロール別スコープ（businessId / partnerId / portalVisible の強制）は
 * セキュリティ要件が API ごとに異なるため、ここには含めず呼び出し側の責務とする。
 * 呼び出し側は「本関数を先に適用 → ロールスコープを後から適用」の順にすること。
 * 逆順にするとユーザー指定のフィルターがスコープを上書きできてしまう。
 */

export type ProjectCustomFieldFilter = {
  key: string;
  values: string[];
};

/** searchParams から case-insensitive な contains 検索条件を作る */
function containsSearch(search: string) {
  return [
    { projectNo: { contains: search, mode: 'insensitive' } },
    { customer: { customerName: { contains: search, mode: 'insensitive' } } },
    { partner: { partnerName: { contains: search, mode: 'insensitive' } } },
    { projectAssignedUserName: { contains: search, mode: 'insensitive' } },
  ];
}

/**
 * 画面の絞り込み条件を Prisma の where に反映する。
 *
 * カスタムフィールド（`filter[customField_xxx]`）は JSON カラム内の値のため
 * Prisma では絞り込めない。戻り値の customFieldFilters を使って
 * 取得後に {@link matchesCustomFieldFilters} で絞り込むこと。
 */
export function applyProjectListFilters(
  where: Record<string, unknown>,
  searchParams: URLSearchParams,
): { customFieldFilters: ProjectCustomFieldFilter[] } {
  // 有効/削除済み
  const isActiveParam =
    searchParams.get('filter[isActive]') ?? searchParams.get('isActive') ?? '';
  if (isActiveParam === 'true') {
    where.projectIsActive = true;
  } else if (isActiveParam === 'false') {
    where.projectIsActive = false;
  }

  // ポータル表示
  const portalVisibleParam = searchParams.get('filter[portalVisible]');
  if (portalVisibleParam === 'true') {
    where.portalVisible = true;
  } else if (portalVisibleParam === 'false') {
    where.portalVisible = false;
  }

  // 顧客（関連案件タブ・一覧フィルター）
  const customerIdParam =
    searchParams.get('filter[customerId]') || searchParams.get('customerId');
  if (customerIdParam) {
    const parsed = parseInt(customerIdParam, 10);
    if (Number.isFinite(parsed)) where.customerId = parsed;
  }

  // テキスト検索
  const search = searchParams.get('search') ?? '';
  if (search) {
    where.OR = containsSearch(search);
  }

  // 営業ステータス（カンマ区切りの複数選択）
  const statusFilter = searchParams.get('filter[projectSalesStatus]');
  if (statusFilter) {
    const statuses = statusFilter.split(',').filter(Boolean);
    if (statuses.length > 0) {
      where.projectSalesStatus = { in: statuses };
    }
  }

  // 受注予定月レンジ（YYYY-MM の文字列比較）
  const monthFrom = searchParams.get('filter[expectedCloseMonthFrom]');
  const monthTo = searchParams.get('filter[expectedCloseMonthTo]');
  if (monthFrom || monthTo) {
    const range: Record<string, string> = {};
    if (monthFrom) range.gte = monthFrom;
    if (monthTo) range.lte = monthTo;
    where.projectExpectedCloseMonth = range;
  }

  // 受注予定月（単月完全一致）
  const monthExact = searchParams.get('filter[projectExpectedCloseMonth]');
  if (monthExact && !monthFrom && !monthTo) {
    where.projectExpectedCloseMonth = monthExact;
  }

  // 担当者（ID）
  const assignedUserFilter = searchParams.get('filter[projectAssignedUserId]');
  if (assignedUserFilter) {
    const parsed = parseInt(assignedUserFilter, 10);
    if (Number.isFinite(parsed)) where.projectAssignedUserId = parsed;
  }

  // 担当者（名前・部分一致）— 一覧のフィルターパネルはこちらを送る
  const assignedUserNameFilter = searchParams.get('filter[projectAssignedUserName]');
  if (assignedUserNameFilter) {
    where.projectAssignedUserName = {
      contains: assignedUserNameFilter,
      mode: 'insensitive',
    };
  }

  // カスタムフィールド（JSON カラムのためアプリ側で絞り込む）
  const customFieldFilters: ProjectCustomFieldFilter[] = [];
  searchParams.forEach((paramValue, paramKey) => {
    const match = paramKey.match(/^filter\[customField_(.+)\]$/);
    if (match && paramValue) {
      customFieldFilters.push({
        key: match[1],
        values: paramValue.split(',').filter(Boolean),
      });
    }
  });

  return { customFieldFilters };
}

/**
 * カスタムフィールドの絞り込み判定（アプリ側フィルター）。
 * 全条件を満たす場合のみ true。
 */
export function matchesCustomFieldFilters(
  customData: Record<string, unknown> | null,
  filters: ProjectCustomFieldFilter[],
): boolean {
  if (filters.length === 0) return true;
  if (!customData) return false;
  return filters.every(({ key, values }) => {
    const fieldVal = customData[key];
    if (fieldVal == null) return false;
    if (typeof fieldVal === 'boolean') return values.includes(String(fieldVal));
    return values.some((v) => String(fieldVal).includes(v));
  });
}
