import PlanNotice from '@/components/PlanNotice';
import Slider from '@/components/Slider';
import StatsGrid from '@/components/StatsGrid';
import CtaBand from '@/components/CtaBand';
import { resolveAbout } from '@/lib/about';
import { getCompanyDetails } from '@/lib/company.server';
import styles from './page.module.css';

/**
 * The home page: the tenant's hero, and the invitation to get in touch.
 *
 * Deliberately short. The story, team and gallery live on `/about` and the
 * contact details on `/contact`, and the two template-written sections that
 * used to sit here — "what we do" and "why us" — are gone: every word on the
 * site is now the tenant's own, which is the point of the platform.
 *
 * The company was already resolved from the domain in the layout; this call is
 * deduped against that one, so the page costs no extra request.
 */
export default async function HomePage() {
  const company = await getCompanyDetails();

  /**
   * The plan is what pays for the content, so when the platform stops serving a
   * tenant the page returns the holding notice and nothing else. Returning early
   * here — rather than only hiding it in the layout — is what keeps the site out
   * of the streamed payload as well as off the screen.
   */
  if (!company.service.active) return <PlanNotice company={company} />;

  /**
   * The same figures the About page opens with. They belong here too: a
   * visitor who never leaves the home page should still see what the business
   * has to show for itself.
   */
  const { stats } = resolveAbout(company);

  return (
    <>
      <Slider company={company} />

      {/*
        Nothing at all unless the tenant has written figures — `StatsGrid`
        returns null on an empty set, so the section would be an empty band.
      */}
      {stats.length > 0 ? (
        <section className={styles.figures}>
          <div className="container">
            <StatsGrid stats={stats} />
          </div>
        </section>
      ) : null}

      {/*
        The full contact section moved to `/contact`. What stays here is the
        invitation to go there — a home page that ends in a form and a table of
        addresses buries everything above it. The band itself is shared with
        every other page that ends in one.
      */}
      <CtaBand company={company} />
    </>
  );
}
