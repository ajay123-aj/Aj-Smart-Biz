import type { Metadata } from 'next';
import { Suspense, type CSSProperties, type ReactNode } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { WhatsAppFab } from '@/components/WhatsAppButton';
import { ShareFab } from '@/components/ShareButton';
import LeadTracker from '@/components/LeadTracker';
import { getCompanyDetails } from '@/lib/company.server';
import ServiceUnavailable from '@/components/ServiceUnavailable';
import { SERVICE_UNAVAILABLE } from '@/config/site';
import { fillCompany, shareLinkOf, toFileUrl, type CompanyDetails } from '@/lib/company';
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

  /**
   * With the API unreachable there is no tenant to name, and `company.name`
   * holds the platform's placeholder — so putting it in the tab would tell a
   * visitor they had reached a company nobody confirmed, and would let a
   * crawler record that name against this domain. The page says what is
   * actually true instead, and asks not to be indexed at all.
   */
  if (!company.apiReachable) {
    return {
      title: SERVICE_UNAVAILABLE.title,
      icons: { icon: [{ url: DEFAULT_FAVICON }] },
      robots: { index: false, follow: false },
    };
  }

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
 * Maps the company's theme onto the template's brand variables.
 *
 * Only the tenant's own colours move. The surfaces, radii, shadows and type
 * scale in `globals.css` are the template's design and stay put — that is what
 * keeps every site built on this theme recognisably the same theme, and it is
 * why a tenant cannot accidentally repaint the whole page by picking a colour.
 *
 * `accentColor` drives the hairline-and-eyebrow accent rather than a background
 * tint: it is a small, high-contrast role, so an arbitrary colour cannot make
 * body text unreadable the way a surface colour could.
 */
function themeVariables(company: CompanyDetails): CSSProperties {
  const theme = company.theme;
  if (!theme?.primaryColor) return {};

  return {
    '--brand': theme.primaryColor,
    '--brand-strong': theme.secondaryColor || theme.primaryColor,
    ...(theme.accentColor ? { '--accent': theme.accentColor } : {}),
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

  /**
   * The API could not be reached, so nothing on this page would be the
   * tenant's — see `getCompanyDetails`. The site is replaced entirely, and the
   * chrome goes with it: a header carrying the platform's placeholder name and
   * a footer carrying a placeholder address are exactly the invented content
   * this is here to prevent.
   *
   * Returned before the tracker, too. A visit reported against a company the
   * site could not identify is a row of noise in somebody's lead report.
   */
  if (!company.apiReachable) {
    return (
      <html lang="en">
        <body>
          <ServiceUnavailable />
        </body>
      </html>
    );
  }

  /**
   * The floating actions. Both are absent unless the tenant is actually
   * entitled to them, and each component returns null on its own, so this needs
   * no condition beyond knowing whether the WhatsApp bubble is taking the
   * corner — the share bubble sits above it when it is.
   */
  const share = shareLinkOf(company);
  const hasWhatsapp = Boolean(company.features?.whatsapp);

  return (
    <html lang="en">
      <body style={themeVariables(company)}>
        {/**
         * Website launch, reported.
         *
         * Outside the `served` branch on purpose: a company whose plan has
         * lapsed is showing a holding page, and the fact that people are still
         * arriving is exactly what its owner needs to see before deciding
         * whether to renew. Dropping those visits would make the site look
         * abandoned in the one report that could argue otherwise.
         *
         * `Suspense` because the tracker reads the query string, and Next
         * requires a boundary around any component that does — without one the
         * whole route opts out of static rendering.
         */}
        <Suspense fallback={null}>
          <LeadTracker />
        </Suspense>

        {served ? (
          <>
            <a className="skip-link" href="#main">
              Skip to content
            </a>
            <Header company={company} />
            <main id="main">{children}</main>
            <Footer company={company} />
            <WhatsAppFab company={company} />
            <ShareFab
              share={share}
              message={share ? fillCompany(share.message, company) : ''}
              raised={hasWhatsapp}
            />
          </>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
