import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getSite } from './api';

/**
 * Everything search engines and link previews need that is not page copy.
 *
 * The public address comes from `SITE_URL` (e.g. `https://ajsmartbiz.in`) when
 * it is set. Without it the address is read from the request — behind nginx
 * the Host and X-Forwarded-Proto headers already carry the public domain — so
 * canonicals, the sitemap and share images are absolute and correct in every
 * environment without a rebuild. Set `SITE_URL` in production anyway: a
 * canonical should never depend on which hostname a crawler happened to use.
 */
export async function siteUrl(): Promise<string> {
  const fromEnv = process.env.SITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');

  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    if (host) {
      const proto =
        h.get('x-forwarded-proto')?.split(',')[0]?.trim() ??
        (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
      return `${proto}://${host}`;
    }
  } catch {
    /* Outside a request (never expected here, since every route is dynamic). */
  }
  return 'http://localhost:4700';
}

/** The public routes, in the order they matter. Used by the sitemap. */
export const PUBLIC_ROUTES: { path: string; priority: number; changeFrequency: 'weekly' | 'monthly' }[] = [
  { path: '/', priority: 1, changeFrequency: 'weekly' },
  { path: '/plans', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/services', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/templates', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/demo', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/about', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/contact', priority: 0.7, changeFrequency: 'monthly' },
];

/**
 * The share image from `app/opengraph-image.tsx`. Next only attaches it
 * automatically where a page does not set `openGraph` itself, so pages that do
 * name it explicitly.
 */
const SHARE_IMAGE = { url: '/opengraph-image', width: 1200, height: 630, alt: 'Business websites on a monthly recharge' };

/** Shared Open Graph fields. A page's `openGraph` replaces the layout's whole
 *  block rather than merging with it, so every page repeats these. */
export async function baseOpenGraph() {
  const { content } = await getSite();
  return {
    type: 'website' as const,
    locale: 'en_IN',
    siteName: content.site?.name ?? content.site?.shortName ?? 'Aj Smart Biz Technology',
  };
}

/**
 * Per-page metadata: title, description, canonical, and the same title and
 * description for link previews. `path` is relative; the root layout's
 * `metadataBase` makes it absolute.
 */
export async function pageMetadata(path: string, title: string, description: string): Promise<Metadata> {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { ...(await baseOpenGraph()), url: path, title, description, images: [SHARE_IMAGE] },
    twitter: { card: 'summary_large_image', title, description, images: [SHARE_IMAGE] },
  };
}

/**
 * A JSON-LD `<script>` body. `<` is escaped so text from the API can never
 * close the script tag early.
 */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
