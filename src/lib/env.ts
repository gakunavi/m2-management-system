/**
 * 環境変数バリデーション
 * アプリ起動時に必須の環境変数が設定されているかチェックする
 */

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`環境変数 ${key} が設定されていません。.env ファイルを確認してください。`);
  }
  return value;
}

function optional(key: string, defaultValue?: string): string | undefined {
  return process.env[key] ?? defaultValue;
}

export const env = {
  // Database
  DATABASE_URL: required('DATABASE_URL'),

  // NextAuth.js
  NEXTAUTH_URL: required('NEXTAUTH_URL'),
  NEXTAUTH_SECRET: required('NEXTAUTH_SECRET'),

  // Node
  NODE_ENV: optional('NODE_ENV', 'development') as string,
  get isProduction() {
    return this.NODE_ENV === 'production';
  },

  // Storage
  STORAGE_PROVIDER: optional('STORAGE_PROVIDER', 'local') as 'local' | 's3',

  // AWS S3 (STORAGE_PROVIDER=s3 の場合のみ必須)
  get AWS_REGION() {
    if (this.STORAGE_PROVIDER === 's3') return required('AWS_REGION');
    return optional('AWS_REGION');
  },
  get AWS_S3_BUCKET() {
    if (this.STORAGE_PROVIDER === 's3') return required('AWS_S3_BUCKET');
    return optional('AWS_S3_BUCKET');
  },
  get AWS_ACCESS_KEY_ID() {
    if (this.STORAGE_PROVIDER === 's3') return required('AWS_ACCESS_KEY_ID');
    return optional('AWS_ACCESS_KEY_ID');
  },
  get AWS_SECRET_ACCESS_KEY() {
    if (this.STORAGE_PROVIDER === 's3') return required('AWS_SECRET_ACCESS_KEY');
    return optional('AWS_SECRET_ACCESS_KEY');
  },

  // Email (将来のメール通知機能用)
  EMAIL_PROVIDER: optional('EMAIL_PROVIDER') as 'resend' | 'sendgrid' | 'ses' | undefined,
  EMAIL_FROM: optional('EMAIL_FROM'),
  EMAIL_API_KEY: optional('EMAIL_API_KEY'),

  // Cron
  CRON_SECRET: optional('CRON_SECRET'),
} as const;
