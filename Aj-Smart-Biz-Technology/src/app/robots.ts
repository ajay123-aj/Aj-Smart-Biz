import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/seo';

/**
 * `/robots.txt` — crawl everything public, skip the tracking endpoint, and
 * point at the sitemap.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = await siteUrl();
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/'] }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
