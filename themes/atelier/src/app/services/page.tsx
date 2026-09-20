import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import PlanNotice from '@/components/PlanNotice';
import ServiceUnavailable from '@/components/ServiceUnavailable';
import CompanyNotFound from '@/components/CompanyNotFound';
import ServicesSection from '@/components/ServicesSection';
import CtaBand from '@/components/CtaBand';
import { SERVICES_COPY } from '@/config/site';
import { navOf, type CompanyDetails } from '@/lib/company';
import { getCompanyDetails } from '@/lib/company.server';
import { anonymousMetadata } from '@/lib/metadata';
import { flattenCategories, resolveServices } from '@/lib/services';
import styles from './page.module.css';

type Search = Promise<Record<string, string | string[] | undefined>>;

/** The first value of a repeated query parameter, trimmed, or null. */
const categoryParam = (params: Record<string, string | string[] | undefined>): string | null => {
  const raw = params.category;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() || null;
};

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

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const [company, params] = await Promise.all([getCompanyDetails(), searchParams]);

  const anonymous = anonymousMetadata(company);
  if (anonymous) return anonymous;
  const services = resolveServices(company);

  /* A filtered view is titled by its category - it is what somebody arriving
     from a search result is actually looking at, and "Services · Acme" on every
     one of eleven category views tells a search engine nothing. */
  const slug = categoryParam(params);
  const named = slug
    ? flattenCategories(services?.categories ?? []).find((entry) => entry.node.slug === slug)?.node.name
    : null;

  return {
    title: `${named ?? pageLabel(company)} · ${company.name}`,
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
export default async function ServicesPage({ searchParams }: { searchParams: Search }) {
  const [company, params] = await Promise.all([getCompanyDetails(), searchParams]);

  /**
   * The layout declines to frame the site when the API is unreachable; the page
   * has to decline to render it too. Skipping only the layout would still leave
   * this page in the streamed RSC payload, where its markup — placeholder
   * company and all — remains readable to anyone who looks. Same rule, and the
   * same reason, as the plan check below.
   */
  if (!company.apiReachable) return <ServiceUnavailable />;

  /**
   * The API answered, and said this host belongs to no company. Same rule as
   * the check above and the plan check below: the page has to decline to render
   * as well as the layout, or the site stays readable in the streamed RSC
   * payload with the platform's placeholder company in it.
   */
  if (!company.resolved) return <CompanyNotFound />;

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

  /**
   * The category filter.
   *
   * A slug that names nothing falls through to the whole list rather than to an
   * empty page - a stale link somebody shared should show the shop, not a dead
   * end. `resolveServices` applies the same fallback, so the heading and the
   * grid can never disagree about what is being shown.
   */
  const slug = categoryParam(params);
  const categories = flattenCategories(services.categories);
  const current = slug ? categories.find((entry) => entry.node.slug === slug)?.node ?? null : null;
  const filtered = resolveServices(company, undefined, { category: current?.slug ?? null });

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
            {filtered?.total ?? services.total} {(filtered?.total ?? services.total) === 1 ? 'service' : 'services'}
            {current ? ` · ${current.name}` : ''}
          </p>
        </div>
      </header>

      {/*
        The filter, as a row of chips rather than a dropdown.

        A dropdown hides the options, and the options here are the argument: a
        visitor who can see the shop is sorted into six things understands the
        shop. Each is a real link with its own URL, which a `<select>` on a
        server-rendered page cannot be without JavaScript. Absent entirely for a
        tenant that never sorted its services.
      */}
      {categories.length ? (
        <nav className={styles.filter} aria-label="Service categories">
          <div className="container">
            <ul className={styles.chips}>
              <li>
                <Link className={`${styles.chip} ${current ? '' : styles.chipOn}`} href="/services">
                  {SERVICES_COPY.allCategories}
                </Link>
              </li>
              {categories.map(({ node, depth }) => (
                <li key={node.id}>
                  <Link
                    className={`${styles.chip} ${node.slug === current?.slug ? styles.chipOn : ''} ${
                      depth ? styles.chipChild : ''
                    }`}
                    href={`/services?category=${encodeURIComponent(node.slug)}`}
                  >
                    {node.name}
                    <span className={styles.chipCount}>{node.serviceCount}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      ) : null}

      {/*
        The whole list — no limit, unlike the home page. The component brings
        its own spacing and its own decision about what to render, so there is
        nothing for this page to arrange.
      */}
      <ServicesSection company={company} category={current?.slug ?? null} showHead={false} className={styles.list} />

      {/* Every page closes the same way, with the same band. */}
      <CtaBand company={company} />
    </>
  );
}
