import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// ============================================
// POST /api/v1/test-email
// テストメール送信（admin専用）
// ============================================

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: { message: 'Unauthorized' } },
        { status: 401 },
      );
    }

    const body = await request.json();
    const to = body.to as string;

    if (!to || !to.includes('@')) {
      return NextResponse.json(
        { success: false, error: { message: 'Valid email address is required' } },
        { status: 400 },
      );
    }

    await sendEmail({
      to,
      subject: '[M²] テストメール',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a2e; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">
            テストメール送信成功
          </h2>
          <p style="color: #334155; line-height: 1.6;">
            このメールは M² 管理システムからのテスト送信です。<br/>
            メール通知機能が正常に動作しています。
          </p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr>
              <td style="padding: 8px 12px; background: #f8fafc; font-weight: 600; width: 120px;">送信先</td>
              <td style="padding: 8px 12px;">${to}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f8fafc; font-weight: 600;">送信日時</td>
              <td style="padding: 8px 12px;">${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f8fafc; font-weight: 600;">送信元</td>
              <td style="padding: 8px 12px;">${process.env.EMAIL_FROM ?? 'noreply@example.com'}</td>
            </tr>
          </table>
          <p style="color: #64748b; font-size: 12px; margin-top: 24px;">
            M² 管理システムからの自動通知です。
          </p>
        </div>
      `,
    });

    return NextResponse.json({
      success: true,
      data: { message: `Test email sent to ${to}` },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: { message: 'Failed to send test email' } },
      { status: 500 },
    );
  }
}
