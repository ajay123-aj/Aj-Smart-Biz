import type { Metadata } from 'next';
import Link from 'next/link';
import PlanNotice from '@/components/PlanNotice';
import ServiceUnavailable from '@/components/ServiceUnavailable';
import CompanyNotFound from '@/components/CompanyNotFound';
import TeamSection from '@/components/TeamSection';
import GallerySection from '@/components/GallerySection';
import CtaBand from '@/components/CtaBand';
import FiguresSection from '@/components/FiguresSection';
import { ABOUT_PAGE } from '@/config/site';
import { resolveAbout } from '@/lib/about';
import { fillCompany, siteCompany, toFileUrl } from '@/lib/company';
import { getCompanyDetails } from '@/lib/company.server';
import { anonymousMetadata } from '@/lib/metadata';
import styles from './page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const company = await getCompanyDetails();

  const anonymous = anonymousMetadata(company);
  if (anonymous) return anonymous;
  const about = resolveAbout(company);

  return {
    title: `${ABOUT_PAGE.metaTitle} · ${company.name}`,
    description: about.lead || company.description || undefined,
    // A holding page must never be indexed as the company's content.
    robots: company.service.active ? undefined : { index: false, follow: false },
  };
}

/**
 * About us — its own page rather than a band on the home page.
 *
 * Everything a visitor might want in order to decide whether these are the
 * right people: who they are, the numbers behind that, the faces, and the work.
 * Putting them together is the point — the story means more next to the
 * photographs than it does wedged between "what we do" and a contact form.
 *
 * All four blocks come from the same company-details call the layout already
 * made, so the page costs no extra request, and each one is absent rather than
 * empty when the tenant is not entitled to it.
 */
export default async function AboutPage() {
  const company = await getCompanyDetails();

  // The plan is what pays for the content — same rule as the home page.
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

  if (!company.service.active) return <PlanNotice company={company} />;

  const about = resolveAbout(company);
  const logo = toFileUrl(company.logo);

  /*
   * The masthead heading is the tenant's; the story heading is the template's.
   * A company that named its About "How we got here" would get that twice on
   * one page, once as the h1 and again as the h2 under it. When they collide
   * the template's is the one to drop — theirs is the one they wrote — and the
   * prose then takes the full width.
   */
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const showStoryHead = !same(about.title, ABOUT_PAGE.storyTitle);


  return (
    <>
      {/* ------------------------------- masthead ------------------------------- */}
      <header className={styles.masthead}>
        <div className="container">
          <nav className={styles.crumbs} aria-label="Breadcrumb">
            <Link className={styles.crumb} href="/">
              Home
            </Link>
            <span className={styles.crumbSep} aria-hidden="true">
              /
            </span>
            <span aria-current="page">{ABOUT_PAGE.metaTitle}</span>
          </nav>

          <div className={styles.mastheadBody}>
            <div>
              <span className="eyebrow">{about.eyebrow}</span>
              <h1 className={styles.title}>{about.title}</h1>
              {about.lead ? <p className={styles.lead}>{about.lead}</p> : null}
            </div>

            {/*
              The company's own mark, quietly. A masthead with nothing on the
              right reads as an unfinished layout on a wide screen; a tenant
              with no logo gets the space back rather than a placeholder.
            */}
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={styles.mark} src={logo} alt={`${company.name} logo`} />
            ) : null}
          </div>

        </div>
      </header>

      {/* -------------------------------- story -------------------------------- */}
      <section className="section" id="story">
        <div className="container">
          <div className={`${styles.story} ${showStoryHead ? '' : styles.storyWide}`}>
            {/*
              Heading on the left, prose in a panel on the right.

              The aside used to carry an "on this page" jump list as well. On a
              page with three short sections that was more navigation than page:
              it repeated the headings you could already see, and it named the
              first section something other than the heading beside it. With it
              gone the aside is a heading, which is all it needs to be.
            */}
            {showStoryHead ? (
              <div className={styles.storyHead}>
                <span className="eyebrow">{ABOUT_PAGE.storyEyebrow}</span>
                <h2 className={styles.storyTitle}>{ABOUT_PAGE.storyTitle}</h2>
                {/* Ties the narrow column to the panel beside it, so the heading
                    does not read as a caption floating in white space. */}
                <span className={styles.storyRule} aria-hidden="true" />
              </div>
            ) : null}

            {/*
              The panel is the fix for a short story. Prose alone in a wide
              column left most of the row empty and made two sentences look like
              a mistake; inside a panel that fills the column, the same two
              sentences look deliberate. The measure is capped on the text block
              inside it — and centred there — so the panel never ends up as a
              narrow ribbon of words against a wide field of white.
            */}
            <div className={styles.storyPanel}>
              <div className={styles.storyProse}>
                {about.paragraphs.map((paragraph, index) => (
                  <p className={styles.prose} key={`${index}-${paragraph.slice(0, 32)}`}>
                    {paragraph}
                  </p>
                ))}

                {/* A page with a heading and nothing under it is worse than one
                    that says plainly there is nothing more yet. */}
                {about.paragraphs.length === 0 ? (
                  <p className={styles.prose}>{fillCompany(ABOUT_PAGE.emptyStory, company)}</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Each renders nothing at all unless the tenant is entitled to it and
          has put something in it, so neither needs a guard here. */}
      <TeamSection company={company} />
      {/* The gallery is a client component, so it takes the lightened company —
          the catalogue has no business in this page's payload. See `siteCompany`. */}
      <GallerySection company={siteCompany(company)} />

      {/*
        The figures, immediately before the closing band — the same place the
        home page puts them, so a visitor meets the band in one position rather
        than high on one page and low on the other.

        They were directly under the masthead, which is the wrong end of this
        page: the story, the people and the work are what a reader came to About
        for, and the numbers mean more once those have been read than they do
        above them. The same component, the same heading, the same cards.

        Renders nothing when the tenant is not carrying the section.
      */}
      <FiguresSection company={company} />

      {/* The same band that closes the home page, from the same component. */}
      <CtaBand company={company} />
    </>
  );
}
