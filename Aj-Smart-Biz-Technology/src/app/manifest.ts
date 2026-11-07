import type { MetadataRoute } from 'next';
import { getSite } from '@/lib/api';

/* Per request, like every page: the API is not reachable at build time. */
export const dynamic = 'force-dynamic';

/** `/manifest.webmanifest` — name and colours for "Add to home screen". */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { content } = await getSite();
  const site = content.site;
  return {
    name: site?.name ?? site?.shortName ?? 'Aj Smart Biz Technology',
    short_name: site?.shortName ?? site?.name ?? 'Aj Smart Biz',
    description: site?.description,
    start_url: '/',
    display: 'standalone',
    background_color: '#0b0f2a',
    theme_color: '#0b0f2a',
    icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
