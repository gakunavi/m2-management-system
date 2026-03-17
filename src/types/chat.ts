// ============================================
// AI アシスタント 型定義
// ============================================

/** テーブル表示用の構造化データ */
export interface ChatTableData {
  headers: string[];
  rows: (string | number | null)[][];
}

/** 会話一覧アイテム */
export interface ChatConversationItem {
  id: number;
  title: string | null;
  businessId: number | null;
  businessName: string | null;
  updatedAt: string;
  messageCount: number;
}

/** メッセージアイテム */
export interface ChatMessageItem {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  tableData: ChatTableData | null;
  createdAt: string;
}

/** チャット送信リクエスト */
export interface ChatRequest {
  message: string;
  conversationId?: number;
  businessId?: number;
}

/** チャット応答 */
export interface ChatResponse {
  conversationId: number;
  message: string;
  tableData: ChatTableData | null;
}

/** 会話詳細（メッセージ付き） */
export interface ChatConversationDetail {
  id: number;
  title: string | null;
  businessId: number | null;
  businessName: string | null;
  messages: ChatMessageItem[];
}
