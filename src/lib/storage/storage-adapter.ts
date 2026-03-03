// ============================================
// ストレージアダプタ interface
// ============================================

export interface UploadResult {
  /** 保存先のキー（例: "business-cards/1708000000-abc123.jpg"） */
  key: string;
  /** クライアントからアクセス可能な URL */
  url: string;
}

export interface StorageAdapter {
  /**
   * ファイルをアップロードする
   * @param file - ファイルの Buffer
   * @param filename - 元のファイル名
   * @param contentType - MIME タイプ
   * @param directory - 保存先ディレクトリ（例: "business-cards"）
   */
  upload(
    file: Buffer,
    filename: string,
    contentType: string,
    directory: string,
  ): Promise<UploadResult>;

  /**
   * ファイルを削除する
   * @param key - upload() が返した key
   */
  delete(key: string): Promise<void>;

  /**
   * ファイルの存在確認
   */
  exists(key: string): Promise<boolean>;
}
