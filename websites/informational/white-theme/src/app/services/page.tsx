import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import PlanNotice from '@/components/PlanNotice';
import ServiceUnavailable from '@/components/ServiceUnavailable';
import ServicesSection from '@/components/ServicesSection';
import CtaBand from '@/components/CtaBand';
import { SERVICES_COPY } from '@/config/site';
import { navOf, type CompanyDetails } from '@/lib/company';
import { getCompanyDetails } from '@/lib/company.server';
import { resolveServices } from '@/lib/services';
import styles from './page.module.css';

/**
 * What this page is called on this tenant's site.
 *
 * The tenant renames it on Company Details → Services, and the API sends the
 * result in `nav` — so the breadcrumb, the browser tab and the menu all say the
 * same word, whatever word that is. `SERVICES_COPY.metaTitle` is the floor
 * under it, for an API too old to carry the entry.
 */
const pageLabel = (company: CompanyDetails): string =>
  navOf(company).find((entry) => entry.key === 'services')?.label ?? SERVICES_COPY.metaTitle;

export async function generateMetadata(): Promise<Metadata> {
  const company = await getCompanyDetails();
  const services = resolveServices(company);

  return {
    title: `${pageLabel(company)} · ${company.name}`,
    description: services?.lede || company.description || undefined,
    // Nothing to index on a page that is about to 404, and a holding page must
    // never be indexed as the company's content either.
    robots: services && company.service.active ? undefined : { index: false, follow: false },
  };
}

/**
 * Services — its own page, and the whole list on it.
 *
 * The home page carries a shortened band of the same section; this is where the
 * rest of it lives, and where somebody who arrived looking for a specific job
 * lands. Both render one component, so the two can never describe the same
 * business differently — see `ServicesSection`.
 *
 * Gated by `services` on the same rule About, Team, Gallery and Contact follow,
 * with one addition: an **empty** list withholds the page as firmly as a
 * missing grant does. Entitled, switched on and nothing written is an ordinary
 * state for a tenant on its first afternoon, and a Services page with no
 * services on it is worse than no Services page. The API drops the menu entry
 * on the same signal, so nothing on the site points here while it is not there.
 */
export default async function ServicesPage() {
  const company = await getCompanyDetails();

  /**
   * The layout declines to frame the site when the API is unreachable; the page
   * has to decline to render it too. Skipping only the layout would still leave
   * this page in the streamed RSC payload, where its markup — placeholder
   * company and all — remains readable to anyone who looks. Same rule, and the
   * same reason, as the plan check below.
   */
  if (!company.apiReachable) return <ServiceUnavailable />;

  // The plan is what pays for the content — same rule as every other page.
  if (!company.service.active) return <PlanNotice company={company} />;

  /*
   * Withheld, switched off, or simply empty. A 404 is the honest answer to all
   * three: the tenant is not publishing this page, so it does not exist on
   * their website.
   */
  const services = resolveServices(company);
  if (!services) notFound();

  const label = pageLabel(company);

  return (
    <>
      {/* ------------------------------- masthead ------------------------------ */}
      <header className={styles.masthead}>
        <div className="container">
          <nav className={styles.crumbs} aria-label="Breadcrumb">
            <Link className={styles.crumb} href="/">
              Home
            </Link>
            <span className={styles.crumbSep} aria-hidden="true">
              /
            </span>
            <span aria-current="page">{label}</span>
          </nav>

          {/*
            The tenant's own heading, exactly as the section below would print
            it. The section's own head is suppressed below (`showHead={false}`)
            so the page opens with one heading rather than repeating it forty
            pixels further down.
          */}
          <span className="eyebrow">{services.eyebrow}</span>
          <h1 className={styles.title}>{services.title}</h1>
          <p className={styles.lead}>{services.lede}</p>

          {/* The count, plainly. Somebody who came to see whether a particular
              job is on the list wants to know how long the list is. */}
          <p className={styles.count}>
            {services.total} {services.total === 1 ? 'service' : 'services'}
          </p>
        </div>
      </header>

      {/*
        The whole list — no limit, unlike the home page. The component brings
        its own spacing and its own decision about what to render, so there is
        nothing for this page to arrange.
      */}
      <ServicesSection company={company} showHead={false} className={styles.list} />

      {/* Every page closes the same way, with the same band. */}
      <CtaBand company={company} />
    </>
  );
}
