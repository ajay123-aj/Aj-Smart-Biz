import type { MetadataRoute } from 'next';
import { PUBLIC_ROUTES, siteUrl } from '@/lib/seo';

/** `/sitemap.xml` — every public page, absolute, for search engines. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await siteUrl();
  const now = new Date();
  return PUBLIC_ROUTES.map((route) => ({
    url: `${base}${route.path === '/' ? '' : route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
