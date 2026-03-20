import { ImageResponse } from 'next/og';

export const size = {
  width: 192,
  height: 192,
};
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #60a5fa 100%)',
          borderRadius: '20%',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '2px',
          }}
        >
          {/* 4つのブロックで管理ダッシュボードを表現 */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <div
              style={{
                width: '52px',
                height: '52px',
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                borderRadius: '10px',
              }}
            />
            <div
              style={{
                width: '52px',
                height: '52px',
                backgroundColor: 'rgba(255, 255, 255, 0.7)',
                borderRadius: '10px',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <div
              style={{
                width: '52px',
                height: '52px',
                backgroundColor: 'rgba(255, 255, 255, 0.7)',
                borderRadius: '10px',
              }}
            />
            <div
              style={{
                width: '52px',
                height: '52px',
                backgroundColor: 'rgba(255, 255, 255, 0.5)',
                borderRadius: '10px',
              }}
            />
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
