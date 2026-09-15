import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { SITE } from '@/config/site';
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
 * What is left is a header, a main and a footer, all static.
 */

export const metadata: Metadata = {
  title: {
    default: SITE.title,
    /** Every page sets its own title; this is the suffix they share. */
    template: `%s · ${SITE.shortName}`,
  },
  description: SITE.description,
  icons: { icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }] },
  openGraph: {
    title: SITE.title,
    description: SITE.description,
    siteName: SITE.name,
    type: 'website',
  },
};

/**
 * `themeColor` matters more on a dark site than a light one: without it the
 * browser chrome on Android renders white above a near-black page, which on a
 * phone is the first thing anybody sees.
 */
export const viewport: Viewport = {
  themeColor: '#07070e',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Header />
        <main id="main">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
