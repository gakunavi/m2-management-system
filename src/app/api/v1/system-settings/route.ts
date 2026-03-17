// ============================================
// システム設定 API: GET (一覧) / PUT (更新)
// admin ロールのみアクセス可能
// ============================================

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ApiError, handleApiError } from '@/lib/error-handler';
import { encrypt, decrypt, maskApiKey } from '@/lib/encryption';
import { clearSettingsCache } from '@/lib/system-settings';
import { z } from 'zod';

// AI設定の定義
const AI_SETTINGS = [
  {
    key: 'openai_api_key',
    label: 'OpenAI APIキー',
    description: 'OpenAI の API キー（sk-...）',
    isSecret: true,
    isEncrypted: true,
  },
  {
    key: 'openai_model',
    label: 'AIモデル設定',
    description: 'auto（自動切替）/ gpt-4o-mini / gpt-4o',
    isSecret: false,
    isEncrypted: false,
  },
] as const;

const updateSchema = z.object({
  settings: z.array(
    z.object({
      key: z.string(),
      value: z.string(),
    }),
  ),
});

/**
 * GET: システム設定一覧を取得
 * シークレット値はマスク表示
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const actor = session.user as { id: number; role: string };
    if (actor.role !== 'admin') throw ApiError.forbidden();

    // DB から設定を取得
    const dbSettings = await prisma.systemSetting.findMany();
    const dbMap = new Map(dbSettings.map((s) => [s.settingKey, s]));

    // 定義に基づいて設定一覧を構築
    const settings = AI_SETTINGS.map((def) => {
      const dbRecord = dbMap.get(def.key);
      let displayValue = '';
      let hasValue = false;

      if (dbRecord) {
        hasValue = true;
        if (def.isSecret && dbRecord.isEncrypted) {
          // シークレットはマスク表示
          try {
            const decrypted = decrypt(dbRecord.settingValue);
            displayValue = maskApiKey(decrypted);
          } catch {
            displayValue = '(復号エラー)';
          }
        } else {
          displayValue = dbRecord.settingValue;
        }
      }

      return {
        key: def.key,
        label: def.label,
        description: def.description,
        isSecret: def.isSecret,
        value: displayValue,
        hasValue,
        updatedAt: dbRecord?.updatedAt ?? null,
      };
    });

    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT: システム設定を一括更新
 */
export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const actor = session.user as { id: number; role: string };
    if (actor.role !== 'admin') throw ApiError.forbidden();

    const body = await request.json();
    const { settings } = updateSchema.parse(body);

    // 各設定を更新
    const validKeys = new Set<string>(AI_SETTINGS.map((s) => s.key));

    for (const setting of settings) {
      if (!validKeys.has(setting.key)) continue;

      const def = AI_SETTINGS.find((s) => s.key === setting.key);
      if (!def) continue;

      // 空文字の場合は削除
      if (!setting.value.trim()) {
        await prisma.systemSetting.deleteMany({
          where: { settingKey: setting.key },
        });
        clearSettingsCache(setting.key);
        continue;
      }

      // シークレットで「****」を含む場合は変更なし（スキップ）
      if (def.isSecret && setting.value.includes('****')) {
        continue;
      }

      const valueToStore = def.isEncrypted ? encrypt(setting.value) : setting.value;

      await prisma.systemSetting.upsert({
        where: { settingKey: setting.key },
        update: {
          settingValue: valueToStore,
          isEncrypted: def.isEncrypted,
          updatedBy: actor.id,
        },
        create: {
          settingKey: setting.key,
          settingValue: valueToStore,
          isEncrypted: def.isEncrypted,
          updatedBy: actor.id,
        },
      });

      clearSettingsCache(setting.key);
    }

    return NextResponse.json({ success: true, data: { message: '設定を保存しました' } });
  } catch (error) {
    return handleApiError(error);
  }
}
