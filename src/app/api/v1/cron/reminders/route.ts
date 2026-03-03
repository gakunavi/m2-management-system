import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';
import { logger } from '@/lib/logger';

// ============================================
// POST /api/v1/cron/reminders
// 当日期限のリマインダーに対してメール送信
// CRON_SECRET で保護
// ============================================

export async function POST(request: NextRequest) {
  try {
    // CRON_SECRET 認証
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: { message: 'Unauthorized' } },
        { status: 401 },
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 当日期限 + メール通知ON + 未送信 + 未完了のリマインダーを取得
    const dueReminders = await prisma.projectReminder.findMany({
      where: {
        reminderDate: { gte: today, lt: tomorrow },
        notifyEmail: true,
        emailSentAt: null,
        isCompleted: false,
      },
      include: {
        assignee: { select: { id: true, userName: true, userEmail: true } },
        project: {
          select: {
            projectNo: true,
            customer: { select: { customerName: true } },
          },
        },
      },
    });

    let sentCount = 0;

    for (const reminder of dueReminders) {
      const email = reminder.assignee.userEmail;
      if (!email) continue;

      const projectLabel = reminder.project.customer?.customerName
        ? `${reminder.project.projectNo}（${reminder.project.customer.customerName}）`
        : reminder.project.projectNo;

      await sendEmail({
        to: email,
        subject: `[M²] リマインダー: ${reminder.title}`,
        html: buildReminderEmail({
          title: reminder.title,
          description: reminder.description,
          projectLabel,
          reminderDate: reminder.reminderDate.toISOString().split('T')[0],
          assigneeName: reminder.assignee.userName,
        }),
      });

      // 送信済みマーク
      await prisma.projectReminder.update({
        where: { id: reminder.id },
        data: { emailSentAt: new Date() },
      });

      sentCount++;
    }

    return NextResponse.json({
      success: true,
      data: {
        processed: dueReminders.length,
        sent: sentCount,
      },
    });
  } catch (error) {
    logger.error('Reminder email error', error, 'Cron');
    return NextResponse.json(
      { success: false, error: { message: 'Internal error' } },
      { status: 500 },
    );
  }
}

// ============================================
// メールテンプレート
// ============================================

function buildReminderEmail(params: {
  title: string;
  description: string | null;
  projectLabel: string;
  reminderDate: string;
  assigneeName: string;
}): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a2e; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">
        リマインダー通知
      </h2>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 8px 12px; background: #f8fafc; font-weight: 600; width: 120px;">タイトル</td>
          <td style="padding: 8px 12px;">${params.title}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; background: #f8fafc; font-weight: 600;">案件</td>
          <td style="padding: 8px 12px;">${params.projectLabel}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; background: #f8fafc; font-weight: 600;">期日</td>
          <td style="padding: 8px 12px;">${params.reminderDate}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; background: #f8fafc; font-weight: 600;">担当者</td>
          <td style="padding: 8px 12px;">${params.assigneeName}</td>
        </tr>
        ${params.description ? `
        <tr>
          <td style="padding: 8px 12px; background: #f8fafc; font-weight: 600;">メモ</td>
          <td style="padding: 8px 12px;">${params.description}</td>
        </tr>
        ` : ''}
      </table>
      <p style="color: #64748b; font-size: 12px; margin-top: 24px;">
        M² 管理システムからの自動通知です。
      </p>
    </div>
  `;
}
