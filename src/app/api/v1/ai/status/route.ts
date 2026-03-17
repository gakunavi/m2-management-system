// ============================================
// AI設定状態チェック API
// ============================================

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isAiConfigured } from '@/lib/system-settings';
import { ApiError, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const configured = await isAiConfigured();

    return NextResponse.json({
      success: true,
      data: {
        configured,
        isAdmin: user.role === 'admin',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
