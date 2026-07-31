/**
 * 顧客マスタ・代理店マスタの絞り込み条件を組み立てる共通ロジック。
 *
 * 一覧 API（GET /api/v1/customers, /api/v1/partners）と CSV エクスポート API
 * （.../csv）の双方から呼び出す。以前は CSV 側が種別・業種・有効ステータスの
 * 3つしか見ておらず、住所・資本金・設立日・作成日レンジなどで絞り込んでも
 * エクスポートは全件になっていた。
 */

import {
  whereIn,
  whereContains,
  whereDateRange,
  whereNumberRange,
  whereBoolean,
} from '@/lib/filter-helper';

/** 事業スコープ（中間テーブル経由）。businessId 未指定なら空 */
function businessLinkFilter(searchParams: URLSearchParams): Record<string, unknown> {
  const businessIdParam = searchParams.get('businessId');
  if (!businessIdParam) return {};
  const businessId = parseInt(businessIdParam, 10);
  if (!Number.isFinite(businessId)) return {};
  return {
    businessLinks: { some: { businessId, linkStatus: 'active' } },
  };
}

/** 顧客一覧・顧客CSVで共通の where 句 */
export function buildCustomerListWhere(
  searchParams: URLSearchParams,
): Record<string, unknown> {
  const search = searchParams.get('search') ?? '';
  return {
    ...(search
      ? {
          OR: [
            { customerName: { contains: search, mode: 'insensitive' as const } },
            { customerCode: { contains: search, mode: 'insensitive' as const } },
            {
              contacts: {
                some: { contactName: { contains: search, mode: 'insensitive' as const } },
              },
            },
          ],
        }
      : {}),
    ...whereIn(searchParams, 'customerType'),
    ...whereIn(searchParams, 'industryId', 'industryId', (v) => parseInt(v, 10)),
    ...whereContains(searchParams, 'customerAddress'),
    ...whereDateRange(searchParams, 'createdAt'),
    ...whereNumberRange(searchParams, 'customerCapital'),
    ...whereDateRange(searchParams, 'customerEstablishedDate'),
    ...(whereBoolean(searchParams, 'isActive', 'customerIsActive') ?? {}),
    ...businessLinkFilter(searchParams),
  };
}

/** 代理店一覧・代理店CSVで共通の where 句 */
export function buildPartnerListWhere(
  searchParams: URLSearchParams,
): Record<string, unknown> {
  const search = searchParams.get('search') ?? '';
  return {
    ...(search
      ? {
          OR: [
            { partnerName: { contains: search, mode: 'insensitive' as const } },
            { partnerCode: { contains: search, mode: 'insensitive' as const } },
            {
              contacts: {
                some: { contactName: { contains: search, mode: 'insensitive' as const } },
              },
            },
          ],
        }
      : {}),
    ...whereIn(searchParams, 'partnerType'),
    ...whereIn(searchParams, 'partnerTier'),
    ...whereIn(searchParams, 'industryId', 'industryId', (v) => parseInt(v, 10)),
    ...whereContains(searchParams, 'partnerAddress'),
    ...whereDateRange(searchParams, 'createdAt'),
    ...whereDateRange(searchParams, 'partnerEstablishedDate'),
    ...(whereBoolean(searchParams, 'isActive', 'partnerIsActive') ?? {}),
    ...businessLinkFilter(searchParams),
  };
}
