import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: '#0b1210',
          color: '#f4f8f6',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 36 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: '#0f6e56',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            AB
          </div>
          <div style={{ fontSize: 40, fontWeight: 700 }}>Agent Bazaar</div>
        </div>
        <div style={{ fontSize: 30, color: '#b9c4c0', maxWidth: 920, lineHeight: 1.4 }}>
          An AI buyer agent that shops a live marketplace on its own — discovers paid APIs, pays with real testnet
          crypto, and leaves an on-chain review.
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 44 }}>
          {['The Graph', 'Hedera', 'Arc / Circle'].map((label) => (
            <div
              key={label}
              style={{
                display: 'flex',
                padding: '10px 20px',
                borderRadius: 999,
                background: '#16211d',
                color: '#8fd6bc',
                fontSize: 22,
                border: '1px solid #24352f',
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
