import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import PlanNotice from '@/components/PlanNotice';
import ServiceUnavailable from '@/components/ServiceUnavailable';
import ProductsSection from '@/components/ProductsSection';
import CatalogueMasthead from '@/components/CatalogueMasthead';
import CtaBand from '@/components/CtaBand';
import { PRODUCTS_COPY } from '@/config/site';
import { navOf, type CategoryNode, type CompanyDetails } from '@/lib/company';
import { getCompanyDetails } from '@/lib/company.server';
import { findCategory, productsInCategory, resolveCatalogue } from '@/lib/catalogue';
import styles from './page.module.css';

/**
 * What this page is called on this tenant's site.
 *
 * The tenant renames it on Company Details → Products, and the API sends the
 * result in `nav` — so the breadcrumb, the browser tab and the menu all say the
 * same word, whatever word that is.
 */
const pageLabel = (company: CompanyDetails): string =>
  navOf(company).find((entry) => entry.key === 'products')?.label ?? PRODUCTS_COPY.metaTitle;

/** `?category=` is optional and may be absent, repeated or nonsense. */
type Search = Promise<{ category?: string | string[] }>;

const categoryParam = (params: Awaited<Search>): string | null => {
  const raw = params?.category;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() || null;
};

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const [company, params] = await Promise.all([getCompanyDetails(), searchParams]);
  const catalogue = resolveCatalogue(company);

  const slug = categoryParam(params);
  const category = slug && catalogue ? findCategory(catalogue.categories, slug) : null;

  /* A filtered view is titled by its category — it is what somebody arriving
     from a search result is actually looking at, and "Products · Acme" on every
     one of thirty category pages tells a search engine nothing. */
  const heading = category ? category.name : pageLabel(company);

  return {
    title: `${heading} · ${company.name}`,
    description: category?.description || catalogue?.lede || company.description || undefined,
    // Nothing to index on a page about to 404, and a holding page must never be
    // indexed as the company's content either.
    robots: catalogue && company.service.active ? undefined : { index: false, follow: false },
  };
}

/**
 * The catalogue — every product, filterable by category.
 *
 * **One listing that filters, rather than a page per category.** A second set of
 * routes under `/categories/<slug>` would duplicate this page's grid, its
 * masthead and its empty state, and would leave a visitor who landed on "Dining
 * tables" with no way to widen to "Furniture" except the back button. Here the
 * filter is visible, every option is a real link with its own URL, and there is
 * one page to keep right.
 *
 * A category filter includes **everything below it in the tree**. Somebody who
 * clicks "Furniture" wants the dining tables filed under it; asking them to find
 * the subcategory separately is how a catalogue loses a sale. See
 * `productsInCategory`.
 *
 * Gated by `products` on the rule every other optional page follows, with the
 * same addition Services makes: an empty catalogue withholds the page as firmly
 * as a missing grant does, and the API drops the menu entry on the same signal.
 */
export default async function ProductsPage({ searchParams }: { searchParams: Search }) {
  const [company, params] = await Promise.all([getCompanyDetails(), searchParams]);

  /* The layout declines to frame the site when the API is unreachable; the page
     has to decline to render it too, or its markup stays readable in the
     streamed RSC payload. Same rule as the plan check below. */
  if (!company.apiReachable) return <ServiceUnavailable />;
  if (!company.service.active) return <PlanNotice company={company} />;

  const catalogue = resolveCatalogue(company);
  if (!catalogue) notFound();

  const slug = categoryParam(params);
  const category = slug ? findCategory(catalogue.categories, slug) : null;

  /**
   * A `?category=` naming nothing is **not** a 404.
   *
   * The page exists and the catalogue exists; only the filter is stale, which is
   * what an old bookmark looks like after a tenant renames a category. Falling
   * back to the whole range and letting the chips show what is actually there is
   * a better answer than an error page — and it keeps a shared link working
   * rather than punishing whoever followed it.
   */
  const items = category ? productsInCategory(catalogue.items, category.slug) : catalogue.items;

  const label = pageLabel(company);
  const chips = flattenChips(catalogue.categories);

  return (
    <>
      <CatalogueMasthead
        crumbs={
          category
            ? [{ label: 'Home', href: '/' }, { label, href: '/products' }, ...trailOf(catalogue.categories, category)]
            : [{ label: 'Home', href: '/' }, { label }]
        }
        eyebrow={category ? label : catalogue.eyebrow}
        title={category ? category.name : catalogue.title}
        lede={category ? category.description : catalogue.lede}
        count={`${items.length} ${items.length === 1 ? 'product' : 'products'}`}
      />

      {/*
        The filter. Chips rather than a dropdown: the options are the argument —
        a visitor who can see the shop is sorted into six things understands the
        shop — and every chip is a real link with its own URL, which a `select`
        on a server-rendered page cannot be without JavaScript.
      */}
      {chips.length ? (
        <nav className={styles.filter} aria-label={PRODUCTS_COPY.filterLabel}>
          <div className="container">
            <ul className={styles.chips}>
              <li>
                <Link
                  className={`${styles.chip} ${!category ? styles.chipOn : ''}`}
                  href="/products"
                  aria-current={!category ? 'page' : undefined}
                >
                  {PRODUCTS_COPY.allProducts}
                  <span className={styles.chipCount}>{catalogue.counts.products}</span>
                </Link>
              </li>

              {chips.map(({ node, depth }) => (
                <li key={node.id}>
                  <Link
                    className={`${styles.chip} ${depth > 0 ? styles.chipChild : ''} ${
                      category?.slug === node.slug ? styles.chipOn : ''
                    }`}
                    href={`/products?category=${encodeURIComponent(node.slug)}`}
                    aria-current={category?.slug === node.slug ? 'page' : undefined}
                  >
                    {node.name}
                    <span className={styles.chipCount}>{node.productCount}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      ) : null}

      {items.length ? (
        /* The grid, unlimited. The component brings its own cards and its own
           decision about what to render, so there is nothing to arrange here. */
        <ProductsSection
          company={company}
          items={items}
          showHead={false}
          showMore={false}
          className={styles.list}
        />
      ) : (
        <section className={`section ${styles.empty}`}>
          <div className="container">
            <p className={styles.emptyText}>{PRODUCTS_COPY.noMatches}</p>
            <Link className="btn btn--ghost" href="/products">
              {PRODUCTS_COPY.backToProducts} →
            </Link>
          </div>
        </section>
      )}

      <CtaBand company={company} />
    </>
  );
}

/** Every category, flattened with its depth, for the filter row. */
function flattenChips(nodes: CategoryNode[], depth = 0): { node: CategoryNode; depth: number }[] {
  return nodes.flatMap((node) => [
    { node, depth },
    ...flattenChips(node.children ?? [], depth + 1),
  ]);
}

/**
 * The breadcrumb trail down to one category — `Furniture / Tables / Dining
 * tables`, each step a link to that filter.
 *
 * Built by walking the tree rather than read off the product, because this page
 * is looking at a category rather than at any one product in it.
 */
function trailOf(nodes: CategoryNode[], target: CategoryNode): { label: string; href?: string }[] {
  const path: CategoryNode[] = [];

  const walk = (list: CategoryNode[], trail: CategoryNode[]): boolean =>
    list.some((node) => {
      const next = [...trail, node];
      if (node.id === target.id) {
        path.push(...next);
        return true;
      }
      return walk(node.children ?? [], next);
    });

  walk(nodes, []);

  return path.map((node, index) => ({
    label: node.name,
    // The last step is the page itself and gets no link.
    href: index === path.length - 1 ? undefined : `/products?category=${encodeURIComponent(node.slug)}`,
  }));
}
