import type { Metadata, Viewport } from 'next';
import { Suspense, type ReactNode } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import LeadTracker from '@/components/LeadTracker';
import FloatingWhatsApp from '@/components/FloatingWhatsApp';
import Motion from '@/components/Motion';
import { getSite } from '@/lib/api';
import { baseOpenGraph, jsonLd, siteUrl } from '@/lib/seo';
import './globals.css';

/**
 * The shell.
 *
 * Much shorter than the layout of a template in `themes/`, and every absence is
 * the same absence: **there is no tenant.** Those templates resolve a company
 * from the host before anything renders, map that company's theme colours onto
 * CSS variables, and replace the whole page when the API cannot be reached.
 * None of that applies to a site with one owner.
 *
 * What it does share with them now is where the words come from: nothing on
 * this site is written in this project any more. See `lib/api.ts`.
 */

/**
 * Rendered per request, never prerendered at build.
 *
 * **Every word on this site comes from the API**, so a build-time prerender
 * needs the backend reachable from the build container -- which it is not, and
 * should not have to be: the image is built once in CI and run in environments
 * that each talk to a different API. Without this the build fails on
 * `/services` and `/_not-found` with ECONNREFUSED, which is exactly what
 * happened the first time this shipped.
 *
 * It costs nothing that matters. The API response is still cached for
 * `REVALIDATE_SECONDS` in the data cache, and `getSite` is deduped within a
 * render, so the difference is only *when* the first render happens -- not how
 * often the API is asked.
 *
 * Declared on the root layout so it covers every route beneath it, including
 * the `/_not-found` page Next generates itself and which nothing else can
 * annotate.
 */
export const dynamic = 'force-dynamic';

/**
 * ...but keep the data cache.
 *
 * `force-dynamic` otherwise implies no-store for every fetch in the tree, which
 * would turn the shared `revalidate` on `getSite` into a call to the API on
 * every single page view.
 */
export const fetchCache = 'default-cache';

/**
 * The title and description, from the API rather than from a constant.
 *
 * `generateMetadata` instead of a static `metadata` export because the values
 * are fetched. It costs nothing extra — `getSite` is deduped, so this shares
 * the one request the page itself makes.
 *
 * Every field is defensive. Metadata is the one place an undefined value is
 * invisible in development and embarrassing in production: a blank `<title>`
 * shows up as the URL in a search result and as nothing in a shared link.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { content } = await getSite();
  const site = content.site;

  const title = site?.title ?? site?.name ?? 'Aj Smart Biz Technology';
  const shortName = site?.shortName ?? 'Aj Smart Biz';

  return {
    metadataBase: new URL(await siteUrl()),
    title: {
      default: title,
      /** Every page sets its own title; this is the suffix they share. */
      template: `%s · ${shortName}`,
    },
    description: site?.description,
    applicationName: site?.name ?? shortName,
    alternates: { canonical: '/' },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
    },
    icons: { icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }] },
    /* Share image: `app/opengraph-image.tsx`, picked up automatically. */
    openGraph: {
      ...(await baseOpenGraph()),
      url: '/',
      title,
      description: site?.description,
    },
    twitter: { card: 'summary_large_image', title, description: site?.description },
    /* Stops iOS turning random digit runs in copy into phone links; the real
       phone links are explicit `tel:` anchors. */
    formatDetection: { telephone: false },
  };
}

/**
 * `themeColor` matters more on a dark site than a light one: without it the
 * browser chrome on Android renders white above a near-black page, which on a
 * phone is the first thing anybody sees.
 *
 * Static, unlike the metadata above: it is a property of the stylesheet, not of
 * anything anybody edits in the console.
 */
export const viewport: Viewport = {
  themeColor: '#0b0f2a',
  colorScheme: 'dark',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  /**
   * Fetched here only because `Header` is a client component and cannot call
   * `getSite` itself. `Footer` is a server component and reads its own.
   */
  const { content } = await getSite();
  const site = content.site;
  const contact = content.contact;
  const url = await siteUrl();

  /**
   * Structured data: who the business is and how to reach it, so search can
   * show the name, phone and hours directly — every value from the API, and
   * any that is missing simply left out.
   */
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    '@id': `${url}/#organization`,
    name: site?.name ?? site?.shortName,
    alternateName: site?.shortName,
    description: site?.description,
    slogan: site?.tagline,
    url,
    image: `${url}/opengraph-image`,
    logo: `${url}/favicon.svg`,
    ...(contact?.phoneHref ? { telephone: contact.phoneHref } : {}),
    ...(contact?.email ? { email: contact.email } : {}),
    ...(contact?.addressLine
      ? { address: { '@type': 'PostalAddress', streetAddress: contact.addressLine, addressCountry: 'IN' } }
      : {}),
    areaServed: { '@type': 'Country', name: 'India' },
    ...(contact?.whatsapp ? { sameAs: [`https://wa.me/${contact.whatsapp}`] } : {}),
  };
  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${url}/#website`,
    url,
    name: site?.name ?? site?.shortName,
    inLanguage: 'en-IN',
    publisher: { '@id': `${url}/#organization` },
  };

  return (
    <html lang="en-IN">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd([organization, website]) }}
        />
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Header
          shortName={site?.shortName ?? site?.name}
          navLinks={site?.navLinks ?? []}
          phone={contact?.phone}
          phoneHref={contact?.phoneHref}
        />
        <main id="main">{children}</main>
        <Footer />
        <FloatingWhatsApp whatsapp={contact?.whatsapp} />
        {/* Scroll reveals and the card spotlight. Renders nothing. */}
        <Motion />
        {/*
          Renders nothing. Reports every page open to the API so the campaign
          report in the super admin has something to report on — see
          `lib/tracking.ts` and `app/api/track/route.ts`.

          `Suspense` because the tracker reads the query string, and Next
          refuses to statically prerender a page whose tree calls
          `useSearchParams` outside one. `fallback={null}` since there is
          nothing to show while it waits — it renders nothing either way.
        */}
        <Suspense fallback={null}>
          <LeadTracker />
        </Suspense>
      </body>
    </html>
  );
}
