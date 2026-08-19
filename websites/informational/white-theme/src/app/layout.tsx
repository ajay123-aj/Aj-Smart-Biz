import type { Metadata } from 'next';
import type { CSSProperties, ReactNode } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { getCompanyDetails } from '@/lib/company.server';
import { toFileUrl, type CompanyDetails } from '@/lib/company';
import './globals.css';

/** Shown until — and unless — the tenant uploads a favicon of its own. */
const DEFAULT_FAVICON = '/favicon.svg';

/**
 * The tab title and icon come from the same company-details call the page uses.
 * Next dedupes the two `fetch`es within a request, so the API is hit once.
 */
export async function generateMetadata(): Promise<Metadata> {
  const company = await getCompanyDetails();

  /**
   * Always emit an icon link. Without one the browser goes looking for
   * `/favicon.ico` on its own and logs a 404 for every tenant that has not
   * uploaded a favicon — which is most of them.
   */
  const favicon = toFileUrl(company.favicon) ?? DEFAULT_FAVICON;

  return {
    title: company.name,
    description: company.description ?? undefined,
    icons: { icon: [{ url: favicon }] },
    /**
     * A holding page must never be indexed as the company's content. Without
     * this, a plan that lapses for a week can leave "This website is offline"
     * as the tenant's search result long after it is back.
     */
    robots: company.service.active ? undefined : { index: false, follow: false },
    openGraph: {
      title: company.name,
      description: company.description ?? undefined,
      type: 'website',
    },
  };
}

/**
 * Maps the company's theme onto the white theme's brand variables. Only the
 * accent changes — the surfaces stay white, which is the point of this template.
 */
function themeVariables(company: CompanyDetails): CSSProperties {
  const theme = company.theme;
  if (!theme?.primaryColor) return {};

  return {
    '--brand': theme.primaryColor,
    '--brand-strong': theme.secondaryColor || theme.primaryColor,
    ...(theme.accentColor ? { '--brand-soft': `${theme.accentColor}1a` } : {}),
  } as CSSProperties;
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  /**
   * Website launch: resolve the tenant from the domain this request arrived on,
   * once, at the top. Header, slider, sections and footer all read this one
   * result, so the whole page is branded before anything is sent to the browser.
   */
  const company = await getCompanyDetails();

  /**
   * A tenant the platform has stopped serving loses the site chrome as well as
   * the content — the page itself renders the holding notice (see page.tsx).
   *
   * The decision is made in both places on purpose. Skipping `{children}` here
   * would still leave the page rendered in the streamed RSC payload, where the
   * whole site remains readable to anyone who looks; the page has to decline to
   * render it, and the layout has to decline to frame it.
   */
  const served = company.service.active;

  return (
    <html lang="en">
      <body style={themeVariables(company)}>
        {served ? (
          <>
            <a className="skip-link" href="#main">
              Skip to content
            </a>
            <Header company={company} />
            <main id="main">{children}</main>
            <Footer company={company} />
          </>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
