import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PlanNotice from '@/components/PlanNotice';
import ServiceUnavailable from '@/components/ServiceUnavailable';
import CategoriesSection from '@/components/CategoriesSection';
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
    title: `${PRODUCTS_COPY.categoriesMetaTitle} · ${company.name}`,
    description: catalogue?.categoriesLede || company.description || undefined,
    robots: catalogue?.categories.length && company.service.active ? undefined : { index: false, follow: false },
  };
}

/**
 * Every category, with its subcategories named on each tile.
 *
 * The *View all categories* link on the home page leads here. It is not in the
 * site's menu, deliberately: a five-product shop with a header carrying
 * Products, Categories **and** Offers has a menu longer than its stock list. The
 * page is reached from where a visitor is already browsing, which is where
 * somebody actually wants it.
 *
 * A category is a door rather than a page of its own — every tile links into the
 * products listing filtered to it. One listing that filters beats a second
 * listing that duplicates: the filter is visible and changeable, so a visitor
 * who lands on "Dining tables" can widen to "Furniture" without going back.
 *
 * Gated by the same answer everything else in the catalogue is, plus one of its
 * own: no categories means no page. A tenant can publish a perfectly good
 * catalogue with nothing sorted, and a Categories page listing nothing is worse
 * than no Categories page.
 */
export default async function CategoriesPage() {
  const company = await getCompanyDetails();

  if (!company.apiReachable) return <ServiceUnavailable />;
  if (!company.service.active) return <PlanNotice company={company} />;

  const catalogue = resolveCatalogue(company);
  if (!catalogue?.categories.length) notFound();

  const total = catalogue.counts.categories;

  return (
    <>
      <CatalogueMasthead
        crumbs={[
          { label: 'Home', href: '/' },
          { label: pageLabel(company), href: '/products' },
          { label: PRODUCTS_COPY.categoriesMetaTitle },
        ]}
        eyebrow={catalogue.categoriesEyebrow}
        title={catalogue.categoriesTitle}
        lede={catalogue.categoriesLede}
        count={`${total} ${total === 1 ? 'category' : 'categories'}`}
      />

      {/*
        Every main category, unlimited, with its subcategories named on the tile
        — the one place the tenant's tree is worth showing in full, because a
        visitor who can see "Furniture: Tables, Chairs, Storage" has been saved
        a click.
      */}
      <CategoriesSection company={company} showHead={false} showMore={false} showChildren />

      <CtaBand company={company} />
    </>
  );
}
