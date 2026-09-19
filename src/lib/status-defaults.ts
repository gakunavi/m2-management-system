/**
 * 営業ステータスの「デフォルト表示対象」を組み立てる共通ロジック。
 *
 * 案件ムーブメント（/movements）と契約マスタ一覧（/projects）の双方から呼ぶ。
 * 以前はムーブメント側にだけインラインで同じ判定が書かれており、
 * 契約マスタは失注案件も含めて初期表示されていた。
 *
 * 2画面で除外の強さが違う点に注意:
 *   - ムーブメント : 失注 + 最終（受注済み等）を除外 = 「いま動かす案件」だけ
 *   - 契約マスタ   : 失注のみ除外 = 受注済みの契約は台帳として見せ続ける
 * 契約マスタで最終まで除外すると受注済み契約が初期表示から消えるため、
 * excludeFinal は呼び出し側で明示すること。
 */

export type StatusFlagsLike = {
  statusCode: string;
  statusIsActive?: boolean;
  statusIsFinal?: boolean;
  statusIsLost?: boolean;
};

export type DefaultStatusOptions = {
  /** 最終ステータス（受注済み等）も除外するか。既定 false（＝失注のみ除外） */
  excludeFinal?: boolean;
  /**
   * 無効化されたステータスを除外するか。既定 true。
   * 契約マスタ一覧では false にする。無効化済みステータスが付いたままの
   * 案件を初期表示から落とさないため（＝失注以外は素通しにする）。
   */
  excludeInactive?: boolean;
};

/**
 * デフォルトで選択状態にする営業ステータスコードを返す。
 * 定義が0件の場合は空配列（＝呼び出し側で「未確定」として扱う）。
 */
export function buildDefaultStatusCodes(
  definitions: StatusFlagsLike[],
  options: DefaultStatusOptions = {},
): string[] {
  const { excludeFinal = false, excludeInactive = true } = options;
  return definitions
    .filter((s) => (excludeInactive ? s.statusIsActive !== false : true))
    .filter((s) => !s.statusIsLost)
    .filter((s) => (excludeFinal ? !s.statusIsFinal : true))
    .map((s) => s.statusCode);
}
