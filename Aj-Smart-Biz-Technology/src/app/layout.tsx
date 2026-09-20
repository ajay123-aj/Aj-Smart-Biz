import type { Metadata, Viewport } from 'next';
import { Suspense, type ReactNode } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import LeadTracker from '@/components/LeadTracker';
import { getSite } from '@/lib/api';
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
    title: {
      default: title,
      /** Every page sets its own title; this is the suffix they share. */
      template: `%s · ${shortName}`,
    },
    description: site?.description,
    icons: { icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }] },
    openGraph: {
      title,
      description: site?.description,
      siteName: site?.name ?? shortName,
      type: 'website',
    },
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
  themeColor: '#07070e',
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

  return (
    <html lang="en">
      <body>
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
