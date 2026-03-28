// ============================================
// AI コード自動生成 API
// 表示ラベルからフィールドキー/ステップコードを生成
// ============================================

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import OpenAI from 'openai';
import { authOptions } from '@/lib/auth';
import { getSystemSetting, SETTING_KEYS } from '@/lib/system-settings';
import { ApiError, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const apiKey = await getSystemSetting(SETTING_KEYS.OPENAI_API_KEY);
    if (!apiKey) {
      throw ApiError.badRequest('AI APIキーが設定されていません。システム設定で設定してください。');
    }

    const body = await request.json();
    const { label, context } = body as { label?: string; context?: string };

    if (!label || typeof label !== 'string' || label.trim().length === 0) {
      throw ApiError.badRequest('ラベルを入力してください。');
    }

    const contextDescription =
      context === 'step_code'
        ? '営業プロセスのステップコード（例: delivery_prep, contract_review, initial_contact）'
        : 'データベースのフィールドキー（例: industry_scale, contract_amount, contact_email）';

    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `あなたは${contextDescription}を生成するアシスタントです。
ユーザーが日本語の表示ラベルを入力するので、適切な英語のsnake_caseコードを1つだけ返してください。

ルール:
- 小文字の英字とアンダースコアのみ使用
- 短く簡潔に（2〜4語程度）
- 一般的なプログラミング命名規則に従う
- コードのみを返す（説明不要）`,
        },
        { role: 'user', content: label.trim() },
      ],
      temperature: 0.3,
      max_tokens: 50,
    });

    const generated = response.choices[0]?.message?.content?.trim() ?? '';
    // 安全のため英数字とアンダースコアのみに正規化
    const code = generated.replace(/[^a-z0-9_]/gi, '').toLowerCase();

    if (!code) {
      throw ApiError.badRequest('コードの生成に失敗しました。手動で入力してください。');
    }

    return NextResponse.json({
      success: true,
      data: { code },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
