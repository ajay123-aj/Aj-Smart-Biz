import type { Metadata } from 'next';
import Link from 'next/link';
import PlanNotice from '@/components/PlanNotice';
import TeamSection from '@/components/TeamSection';
import GallerySection from '@/components/GallerySection';
import CtaBand from '@/components/CtaBand';
import StatsGrid from '@/components/StatsGrid';
import { ABOUT_PAGE } from '@/config/site';
import { resolveAbout } from '@/lib/about';
import { fillCompany, toFileUrl } from '@/lib/company';
import { getCompanyDetails } from '@/lib/company.server';
import styles from './page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const company = await getCompanyDetails();
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

          {/*
            The figures belong up here, not under the story: they are the
            fastest thing on the page to read, and they gave the masthead the
            substance it was missing when it was a heading on an empty band.
            Renders nothing when the tenant has written none.
          */}
          <StatsGrid stats={about.stats} className={styles.stats} />
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
              </div>
            ) : null}

            {/*
              The panel is the fix for a short story. Prose alone in a wide
              column left most of the row empty and made two sentences look like
              a mistake; inside a panel that fills the column, the same two
              sentences look deliberate. The measure is capped within it, so a
              long story still reads comfortably.
            */}
            <div className={styles.storyPanel}>
              {about.paragraphs.map((paragraph) => (
                <p className={styles.prose} key={paragraph.slice(0, 48)}>
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
      </section>

      {/* Each renders nothing at all unless the tenant is entitled to it and
          has put something in it, so neither needs a guard here. */}
      <TeamSection company={company} />
      <GallerySection company={company} />

      {/* The same band that closes the home page, from the same component. */}
      <CtaBand company={company} />
    </>
  );
}
