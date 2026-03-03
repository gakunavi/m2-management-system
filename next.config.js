/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker / スタンドアロンデプロイ対応
  // `next build` で .next/standalone/ に自己完結した出力を生成
  output: 'standalone',

  // 画像最適化（WebP / AVIF 対応）
  images: {
    formats: ['image/avif', 'image/webp'],
  },

  // セキュリティヘッダー
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
