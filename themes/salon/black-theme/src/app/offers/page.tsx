import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PlanNotice from '@/components/PlanNotice';
import ServiceUnavailable from '@/components/ServiceUnavailable';
import ProductsSection from '@/components/ProductsSection';
import CatalogueMasthead from '@/components/CatalogueMasthead';
import CtaBand from '@/components/CtaBand';
import { PRODUCTS_COPY } from '@/config/site';
import { navOf, type CompanyDetails } from '@/lib/company';
import { getCompanyDetails } from '@/lib/company.server';
import { resolveCatalogue } from '@/lib/catalogue';

const pageLabel = (company: CompanyDetails): string =>
  navOf(company).find((entry) => entry.key === 'products')?.label ?? PRODUCTS_COPY.metaTitle;

export async function generateMetadata(): Promise<Metadata> {
  const company = await getCompanyDetails();
  const catalogue = resolveCatalogue(company);

  return {
    title: `${PRODUCTS_COPY.offersMetaTitle} · ${company.name}`,
    description: catalogue?.offersLede || company.description || undefined,
    /*
     * An offers page is worth indexing while it has offers on it and worth
     * withholding the moment it does not — a search result promising reductions
     * that leads to an empty page is worse for the business than no result.
     */
    robots: catalogue?.offers.length && company.service.active ? undefined : { index: false, follow: false },
  };
}

/**
 * Everything on offer today.
 *
 * **What counts as an offer is the API's answer and only the API's.** A product
 * is here because it has an offer price below its normal one, or because the
 * tenant ticked it by hand — which is the only way a business pricing in words
 * ("From ₹4,999") can run an offer at all, and the only way to express one that
 * is not a reduction ("free fitting this month"). `isOnOffer` decides it once in
 * the backend; nothing on this site re-derives it, or the badge on a card and
 * the contents of this page would drift apart.
 *
 * The page disappears entirely when nothing is reduced — not an empty state, not
 * "no offers right now". A shop with no offers has no offers page, the home
 * band drops with it, and the *See every offer* link goes with the band. All
 * three read the same count.
 */
export default async function OffersPage() {
  const company = await getCompanyDetails();

  if (!company.apiReachable) return <ServiceUnavailable />;
  if (!company.service.active) return <PlanNotice company={company} />;

  const catalogue = resolveCatalogue(company);
  if (!catalogue?.offers.length) notFound();

  const total = catalogue.counts.offers;

  return (
    <>
      <CatalogueMasthead
        crumbs={[
          { label: 'Home', href: '/' },
          { label: pageLabel(company), href: '/products' },
          { label: PRODUCTS_COPY.offersMetaTitle },
        ]}
        eyebrow={catalogue.offersEyebrow}
        title={catalogue.offersTitle}
        lede={catalogue.offersLede}
        count={`${total} ${total === 1 ? 'reduction' : 'reductions'}`}
      />

      {/* The whole list, unlimited — the same cards the home band shows, so a
          product cannot look like one thing there and another here. */}
      <ProductsSection company={company} variant="offers" showHead={false} showMore={false} />

      <CtaBand company={company} />
    </>
  );
}
