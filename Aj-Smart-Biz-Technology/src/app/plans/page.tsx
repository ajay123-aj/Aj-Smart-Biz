import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import PageHeader from '@/components/PageHeader';
import PlansSection from '@/components/PlansSection';
import RechargeSection from '@/components/RechargeSection';
import FaqSection from '@/components/FaqSection';
import CtaBand from '@/components/CtaBand';
import { getSite } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata(
    '/plans',
    'Plans',
    'Monthly recharge plans for a business website — hosting, domain, SSL, backups, support and unlimited edits included. No setup fee, no contract.',
  );
}

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
      <PageHeader path="/plans" crumb="Plans" eyebrow={page?.eyebrow} title={page?.title} lede={page?.lede} />

      <PlansSection footnote={page?.footnote} compare />

      <RechargeSection />

      <FaqSection panel />

      <CtaBand />
    </>
  );
}
