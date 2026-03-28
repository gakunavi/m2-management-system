import { useEntityFieldDefinitions } from './use-entity-field-definitions';

/**
 * 契約マスタ用フィールド定義フック（後方互換ラッパー）。
 * 内部で useEntityFieldDefinitions(businessId, 'projectFields') を呼び出す。
 */
export function useProjectFieldDefinitions(businessId: number) {
  const result = useEntityFieldDefinitions(businessId, 'projectFields');
  return {
    ...result,
    /** @deprecated fields を使用してください */
    projectFields: result.fields,
  };
}
