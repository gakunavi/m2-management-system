// ============================================
// AI アシスタント: OpenAI API クライアント
// ============================================

import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { aiFunctions } from './function-definitions';
import { executeFunctionCall } from './function-executor';
import { getSystemPrompt } from './system-prompt';
import { getSystemSetting, SETTING_KEYS } from '@/lib/system-settings';

const MAX_FUNCTION_CALLS = 5;

// モデル定義
const ADVANCED_MODEL = 'gpt-4o';
const BASIC_MODEL = 'gpt-4o-mini';

/**
 * AIによるモデル自動選択（方法1: AI判定）
 * GPT-4o-mini でユーザーの質問の複雑度を判定し、適切なモデルを選択
 * - データ照会・単純な質問 → GPT-4o-mini（高速・低コスト）
 * - 分析・考察・レポート生成 → GPT-4o（高品質な推論）
 */
async function selectModel(userMessage: string, client: OpenAI, modelSetting: string): Promise<string> {
  // 固定指定されている場合はそれを使用
  if (modelSetting && modelSetting !== 'auto') return modelSetting;

  try {
    const response = await client.chat.completions.create({
      model: BASIC_MODEL,
      messages: [
        {
          role: 'system',
          content: `あなたはユーザーの質問の複雑度を判定するアシスタントです。
以下の基準で判定し、"basic" または "advanced" のみを返してください。

basic（軽量モデルで十分）:
- データの照会・取得（「〇〇を教えて」「一覧を出して」「表にして」）
- 単純な数値の確認
- 挨拶や簡単な会話

advanced（高性能モデルが必要）:
- 分析・考察（「なぜ」「原因」「比較して」）
- レポート・報告書の生成
- 予測・提案・改善案
- 複数のデータを組み合わせた総合的な判断
- 長文の構造化された出力`,
        },
        { role: 'user', content: userMessage },
      ],
      temperature: 0,
      max_tokens: 10,
    });

    const result = response.choices[0]?.message?.content?.trim().toLowerCase() ?? '';
    return result.includes('advanced') ? ADVANCED_MODEL : BASIC_MODEL;
  } catch {
    // 判定失敗時はminiにフォールバック
    return BASIC_MODEL;
  }
}

interface UserContext {
  id: number;
  role: string;
  partnerId?: number | null;
  name: string;
}

interface AiResponse {
  content: string;
}

/**
 * OpenAI クライアントを取得（DB設定優先 → .env フォールバック）
 */
async function getOpenAIClient(): Promise<OpenAI> {
  const apiKey = await getSystemSetting(SETTING_KEYS.OPENAI_API_KEY);

  if (!apiKey) {
    throw new AiNotConfiguredError();
  }

  // APIキーのバリデーション（非ASCII文字が含まれていないか確認）
  // eslint-disable-next-line no-control-regex
  if (!/^[\x00-\x7F]+$/.test(apiKey)) {
    console.error('[ai] API key contains non-ASCII characters - likely decryption failure');
    throw new AiNotConfiguredError();
  }

  return new OpenAI({ apiKey });
}

/**
 * AI未設定エラー（クライアント側で判別用）
 */
export class AiNotConfiguredError extends Error {
  constructor() {
    super('AI_NOT_CONFIGURED');
    this.name = 'AiNotConfiguredError';
  }
}

/**
 * モデル設定をDBから取得
 */
async function getModelSetting(): Promise<string> {
  const model = await getSystemSetting(SETTING_KEYS.OPENAI_MODEL);
  return model ?? 'auto';
}

/**
 * チャットメッセージを処理してAI応答を生成
 */
export async function processChat(
  messages: ChatCompletionMessageParam[],
  user: UserContext,
): Promise<AiResponse> {
  const client = await getOpenAIClient();
  const modelSetting = await getModelSetting();

  // ユーザーの最新メッセージからモデルをAI判定で自動選択
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  const userText = typeof lastUserMessage?.content === 'string' ? lastUserMessage.content : '';
  const model = await selectModel(userText, client, modelSetting);

  const systemMessage: ChatCompletionMessageParam = {
    role: 'system',
    content: getSystemPrompt(user.name),
  };

  const allMessages: ChatCompletionMessageParam[] = [systemMessage, ...messages];

  let functionCallCount = 0;

  while (functionCallCount < MAX_FUNCTION_CALLS) {
    const response = await client.chat.completions.create({
      model,
      messages: allMessages,
      tools: aiFunctions,
      tool_choice: 'auto',
      temperature: 0.3,
      max_tokens: 2000,
    });

    const choice = response.choices[0];
    if (!choice) {
      return { content: '応答を生成できませんでした。' };
    }

    const assistantMessage = choice.message;

    // Function call がない場合は最終応答
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      return { content: assistantMessage.content ?? '応答を生成できませんでした。' };
    }

    // Function call を処理
    allMessages.push(assistantMessage);

    for (const toolCall of assistantMessage.tool_calls) {
      if (toolCall.type !== 'function') continue;
      functionCallCount++;
      const fn = toolCall.function as { name: string; arguments: string };
      const functionName = fn.name;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(fn.arguments);
      } catch {
        args = {};
      }

      const result = await executeFunctionCall(functionName, args, user);

      allMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: result,
      });
    }
  }

  return { content: '処理が複雑すぎるため、質問を絞って再度お試しください。' };
}

/**
 * 会話のタイトルをAIで自動生成
 */
export async function generateConversationTitle(firstMessage: string): Promise<string> {
  try {
    const client = await getOpenAIClient();
    // タイトル生成は常にmini（軽量タスク）
    const response = await client.chat.completions.create({
      model: BASIC_MODEL,
      messages: [
        {
          role: 'system',
          content: '以下のユーザーメッセージから、会話のタイトルを15文字以内の日本語で生成してください。タイトルのみを返してください。',
        },
        { role: 'user', content: firstMessage },
      ],
      temperature: 0.3,
      max_tokens: 50,
    });

    return response.choices[0]?.message?.content?.trim() ?? firstMessage.slice(0, 30);
  } catch {
    return firstMessage.slice(0, 30);
  }
}
