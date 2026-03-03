import { Resend } from 'resend';
import { logger } from '@/lib/logger';

const resend = process.env.EMAIL_API_KEY
  ? new Resend(process.env.EMAIL_API_KEY)
  : null;

const EMAIL_FROM = process.env.EMAIL_FROM ?? 'noreply@example.com';

interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
}

/**
 * メール送信
 * EMAIL_API_KEY が未設定の場合はログ出力のみ（開発環境向け）
 */
export async function sendEmail(params: SendEmailParams): Promise<void> {
  if (!resend) {
    console.log('[Email] Skipped (no API key):', params.subject, '→', params.to);
    return;
  }

  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: Array.isArray(params.to) ? params.to : [params.to],
      subject: params.subject,
      html: params.html,
    });
  } catch (error) {
    // メール送信失敗はログのみ（DB通知は保持される）
    logger.error('Send failed', error, 'Email');
  }
}

// ============================================
// メールテンプレート
// ============================================

export function buildStatusChangeEmail(params: {
  projectName: string;
  oldStatus: string;
  newStatus: string;
  updatedBy: string;
}): { subject: string; html: string } {
  return {
    subject: `[M²] 案件ステータス変更: ${params.projectName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a2e; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">
          案件ステータスが変更されました
        </h2>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr>
            <td style="padding: 8px 12px; background: #f8fafc; font-weight: 600; width: 120px;">案件名</td>
            <td style="padding: 8px 12px;">${params.projectName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; background: #f8fafc; font-weight: 600;">変更前</td>
            <td style="padding: 8px 12px;">${params.oldStatus}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; background: #f8fafc; font-weight: 600;">変更後</td>
            <td style="padding: 8px 12px;">${params.newStatus}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; background: #f8fafc; font-weight: 600;">更新者</td>
            <td style="padding: 8px 12px;">${params.updatedBy}</td>
          </tr>
        </table>
        <p style="color: #64748b; font-size: 12px; margin-top: 24px;">
          M² 管理システムからの自動通知です。
        </p>
      </div>
    `,
  };
}
