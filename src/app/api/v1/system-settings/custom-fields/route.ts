// ============================================
// グローバルカスタムフィールド定義 API
// SystemSetting テーブルに JSON 文字列として保存
// admin ロールのみアクセス可能
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ApiError, handleApiError } from '@/lib/error-handler';

const SETTING_KEYS = {
  customer: 'globalCustomerFields',
  partner: 'globalPartnerFields',
} as const;

// ============================================
// GET /api/v1/system-settings/custom-fields
// ============================================

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { role: string };
    if (user.role !== 'admin') throw ApiError.forbidden();

    const settings = await prisma.systemSetting.findMany({
      where: {
        settingKey: { in: [SETTING_KEYS.customer, SETTING_KEYS.partner] },
      },
    });

    const result: Record<string, unknown[]> = {
      customerFields: [],
      partnerFields: [],
    };

    for (const s of settings) {
      try {
        const parsed = JSON.parse(s.settingValue);
        if (s.settingKey === SETTING_KEYS.customer) {
          result.customerFields = Array.isArray(parsed) ? parsed : [];
        } else if (s.settingKey === SETTING_KEYS.partner) {
          result.partnerFields = Array.isArray(parsed) ? parsed : [];
        }
      } catch {
        // JSON パースエラーは空配列にフォールバック
      }
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// PATCH /api/v1/system-settings/custom-fields
// body: { customerFields?: [...], partnerFields?: [...] }
// ============================================

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (user.role !== 'admin') throw ApiError.forbidden();

    const body = await request.json();

    const updates: { key: string; value: string }[] = [];

    if (body.customerFields !== undefined) {
      if (!Array.isArray(body.customerFields)) {
        throw new ApiError('VALIDATION_ERROR', 'customerFields must be an array', 400);
      }
      updates.push({ key: SETTING_KEYS.customer, value: JSON.stringify(body.customerFields) });
    }

    if (body.partnerFields !== undefined) {
      if (!Array.isArray(body.partnerFields)) {
        throw new ApiError('VALIDATION_ERROR', 'partnerFields must be an array', 400);
      }
      updates.push({ key: SETTING_KEYS.partner, value: JSON.stringify(body.partnerFields) });
    }

    for (const update of updates) {
      await prisma.systemSetting.upsert({
        where: { settingKey: update.key },
        update: {
          settingValue: update.value,
          updatedBy: user.id,
        },
        create: {
          settingKey: update.key,
          settingValue: update.value,
          isEncrypted: false,
          updatedBy: user.id,
        },
      });
    }

    // 更新後の値を返却
    const settings = await prisma.systemSetting.findMany({
      where: {
        settingKey: { in: [SETTING_KEYS.customer, SETTING_KEYS.partner] },
      },
    });

    const result: Record<string, unknown[]> = {
      customerFields: [],
      partnerFields: [],
    };

    for (const s of settings) {
      try {
        const parsed = JSON.parse(s.settingValue);
        if (s.settingKey === SETTING_KEYS.customer) {
          result.customerFields = Array.isArray(parsed) ? parsed : [];
        } else if (s.settingKey === SETTING_KEYS.partner) {
          result.partnerFields = Array.isArray(parsed) ? parsed : [];
        }
      } catch {
        // ignore
      }
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return handleApiError(error);
  }
}
