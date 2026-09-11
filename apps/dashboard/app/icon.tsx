import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

/**
 * The marketplace mark: a 3x3 grid of agent tiles with the centre one picked
 * out solid — many discoverable agents, one chosen. Same geometry as
 * plans/export/logo-mark.svg, scaled from its 512px artboard to 32px (x0.0625).
 * Colours are the design system's own: --accent dark (#4fc3a1) on the OG
 * background (#0b1210), see app/globals.css and app/opengraph-image.tsx.
 *
 * Built from divs rather than an inline SVG because Satori (next/og) renders a
 * flex layout, not arbitrary SVG markup.
 */
export default function Icon() {
  const tile = (solid: boolean) => ({
    width: 8,
    height: 8,
    borderRadius: 2,
    background: '#4fc3a1',
    opacity: solid ? 1 : 0.26,
  });

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1.5,
          background: '#0b1210',
        }}
      >
        {[0, 1, 2].map((row) => (
          <div key={row} style={{ display: 'flex', gap: 1.5 }}>
            {[0, 1, 2].map((col) => (
              <div key={col} style={tile(row === 1 && col === 1)} />
            ))}
          </div>
        ))}
      </div>
    ),
    size,
  );
}
