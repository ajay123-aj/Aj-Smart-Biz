import type { Metadata } from 'next';
import PlansSection from '@/components/PlansSection';
import RechargeSection from '@/components/RechargeSection';
import FaqSection from '@/components/FaqSection';
import CtaBand from '@/components/CtaBand';
import { PLANS_PAGE } from '@/config/site';
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
export default function PlansPage() {
  return (
    <>
      <section className={`section ${styles.head}`}>
        <div className="container">
          <span className="eyebrow">{PLANS_PAGE.eyebrow}</span>
          <h1 className={styles.title}>{PLANS_PAGE.title}</h1>
          <p className={styles.lede}>{PLANS_PAGE.lede}</p>
        </div>
      </section>

      <PlansSection footnote={PLANS_PAGE.footnote} />

      <RechargeSection />

      <FaqSection panel />

      <CtaBand />
    </>
  );
}
