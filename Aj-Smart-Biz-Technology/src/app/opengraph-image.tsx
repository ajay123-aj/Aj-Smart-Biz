import { ImageResponse } from 'next/og';
import { getSite } from '@/lib/api';

/* Per request, like every page: the API is not reachable at build time. */
export const dynamic = 'force-dynamic';

/**
 * The picture shown when a page is shared on WhatsApp, Facebook, LinkedIn or
 * X — drawn at request time from the brand name, title and tagline in the API,
 * so editing them in the super admin updates every preview. Inherited by
 * every route.
 */
export const alt = 'Business websites on a monthly recharge';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  const { content } = await getSite();
  const site = content.site;
  const name = site?.name ?? site?.shortName ?? 'Aj Smart Biz Technology';
  const headline = content.hero?.title
    ? `${content.hero.title} ${content.hero.titleAccent ?? ''}`.trim()
    : (site?.tagline ?? '');
  const tagline = site?.tagline ?? '';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: 'linear-gradient(135deg, #0b0f2a 0%, #1e1b4b 55%, #4c1d95 100%)',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #3b82f6, #7c3aed)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 30,
              fontWeight: 800,
            }}
          >
            {name.charAt(0)}
          </div>
          <div style={{ fontSize: 34, fontWeight: 700, color: '#c7d2fe' }}>{name}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.03em', maxWidth: 980 }}>
            {headline}
          </div>
          {tagline && tagline !== headline ? (
            <div style={{ fontSize: 32, color: 'rgba(255,255,255,0.78)', maxWidth: 960 }}>{tagline}</div>
          ) : null}
        </div>
        <div style={{ display: 'flex', height: 8, width: 220, borderRadius: 8, background: 'linear-gradient(90deg, #3b82f6, #a855f7, #ec4899)' }} />
      </div>
    ),
    size,
  );
}
