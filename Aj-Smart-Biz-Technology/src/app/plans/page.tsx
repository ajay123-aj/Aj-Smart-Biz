import type { Metadata } from 'next';
import PlansSection from '@/components/PlansSection';
import RechargeSection from '@/components/RechargeSection';
import FaqSection from '@/components/FaqSection';
import CtaBand from '@/components/CtaBand';
import { getSite } from '@/lib/api';
import styles from '../services/page.module.css';

export const metadata: Metadata = {
  title: 'Plans',
  description:
    'Monthly recharge plans for a business website — hosting, domain, SSL, backups, support and unlimited edits included. No setup fee, no contract.',
};

/**
 * The pricing page.
 *
 * It reuses `services/page.module.css` for the heading block rather than
 * carrying a near-identical copy: the two pages open with the same three
 * elements at the same measures, and a second file would be a second place for
 * that to drift.
 *
 * `PlansSection` is given no heading here — the page's own `h1` is already
 * both, and repeating it would put "Plans / Plans" down the page.
 */
export default async function PlansPage() {
  const { content } = await getSite();
  const page = content.plans_page;

  return (
    <>
      <section className={`section ${styles.head}`}>
        <div className="container">
          <span className="eyebrow">{page?.eyebrow}</span>
          <h1 className={styles.title}>{page?.title}</h1>
          <p className={styles.lede}>{page?.lede}</p>
        </div>
      </section>

      <PlansSection footnote={page?.footnote} />

      <RechargeSection />

      <FaqSection panel />

      <CtaBand />
    </>
  );
}
