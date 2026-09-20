import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import PlanNotice from '@/components/PlanNotice';
import ServiceUnavailable from '@/components/ServiceUnavailable';
import CompanyNotFound from '@/components/CompanyNotFound';
import ProductGallery from '@/components/ProductGallery';
import ProductsSection from '@/components/ProductsSection';
import CtaBand from '@/components/CtaBand';
import { PRODUCTS_COPY } from '@/config/site';
import { navOf, type CompanyDetails, type ProductItem } from '@/lib/company';
import { getCompanyDetails } from '@/lib/company.server';
import { anonymousMetadata } from '@/lib/metadata';
import { priceOf, resolveCatalogue, stockLabel } from '@/lib/catalogue';
import { canOrder, lineOf, orderingOf } from '@/lib/orders';
import AddToCartButton from '@/components/AddToCartButton';
import styles from './page.module.css';

/** How many other products from the same category to show underneath. */
const RELATED_MAX = 4;

type Params = Promise<{ slug: string }>;

const pageLabel = (company: CompanyDetails): string =>
  navOf(company).find((entry) => entry.key === 'products')?.label ?? PRODUCTS_COPY.metaTitle;

/** The product this URL names, or null. One lookup, used by both exports. */
function findProduct(company: CompanyDetails, slug: string): ProductItem | null {
  const catalogue = resolveCatalogue(company);
  return catalogue?.items.find((item) => item.slug === slug) ?? null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const [company, { slug }] = await Promise.all([getCompanyDetails(), params]);

  const anonymous = anonymousMetadata(company);
  if (anonymous) return anonymous;
  const product = findProduct(company, slug);

  if (!product) {
    return { title: company.name, robots: { index: false, follow: false } };
  }

  return {
    title: `${product.name} · ${company.name}`,
    description: product.summary || product.description?.slice(0, 200) || company.description || undefined,
    robots: company.service.active ? undefined : { index: false, follow: false },
    /* The product's own photograph as the share image. It is the one page on the
       site where a link pasted into a chat should show the thing being talked
       about rather than the company logo. */
    openGraph: product.image ? { images: [product.image] } : undefined,
  };
}

/**
 * One product, in full.
 *
 * The page answers a shopper's questions in the order they ask them, which is
 * why it is laid out the way it is: the photographs, then the name, then the
 * price, then what is included, then the specifications, and the long
 * description last. A description-first page reads as a brochure; this reads as
 * a shop.
 *
 * **Everything here comes from the one payload the layout already fetched.** A
 * product page needs no request of its own — the catalogue for this host arrived
 * whole with `/theme/company-details`, so a deep link costs exactly what the
 * home page costs.
 *
 * A slug that names nothing is a genuine 404, unlike a stale `?category=` on the
 * listing: there is no wider thing to fall back to, and showing "some other
 * product" to somebody who followed a link to a specific one is worse than
 * telling them it is gone.
 */
export default async function ProductPage({ params }: { params: Params }) {
  const [company, { slug }] = await Promise.all([getCompanyDetails(), params]);

  if (!company.apiReachable) return <ServiceUnavailable />;

  /**
   * The API answered, and said this host belongs to no company. Same rule as
   * the check above and the plan check below: the page has to decline to render
   * as well as the layout, or the site stays readable in the streamed RSC
   * payload with the platform's placeholder company in it.
   */
  if (!company.resolved) return <CompanyNotFound />;
  if (!company.service.active) return <PlanNotice company={company} />;

  const catalogue = resolveCatalogue(company);
  if (!catalogue) notFound();

  const product = catalogue.items.find((item) => item.slug === slug);
  if (!product) notFound();

  const price = priceOf(product, company);
  const stock = stockLabel(product);
  const label = pageLabel(company);

  /* The same two answers the card asks for, and the same snapshot, so adding
     from here and adding from a card produce one identical line. */
  const orders = orderingOf(company);
  const line = orders ? lineOf(product, company) : null;

  /**
   * Other things in the same category — the question after "is this the one?"
   * is "what else have you got like it", and answering it on the page is worth
   * more than sending somebody back to a filter.
   *
   * Matched on the deepest shared category and never including this product.
   * Absent when there is nothing to show rather than padded out with unrelated
   * stock, which is the thing that makes a "related" band worth ignoring.
   */
  const related = product.category
    ? catalogue.items
      .filter((item) => item.id !== product.id)
      .filter((item) => item.categoryPath.some((node) => node.id === product.category!.id))
      .slice(0, RELATED_MAX)
    : [];

  return (
    <>
      <section className={`section ${styles.page}`}>
        <div className="container">
          {/*
            The trail down to this product, each step a link into the filtered
            listing. Built from `categoryPath`, which the API sends finished —
            so a breadcrumb costs no second request and this page never learns
            to walk a tree.
          */}
          <nav className={styles.crumbs} aria-label="Breadcrumb">
            <Link className={styles.crumb} href="/">
              Home
            </Link>
            <span className={styles.crumbSep} aria-hidden="true">/</span>

            <Link className={styles.crumb} href="/products">
              {label}
            </Link>

            {product.categoryPath.map((node) => (
              <span key={node.id} style={{ display: 'contents' }}>
                <span className={styles.crumbSep} aria-hidden="true">/</span>
                <Link
                  className={styles.crumb}
                  href={`/products?category=${encodeURIComponent(node.slug)}`}
                >
                  {node.name}
                </Link>
              </span>
            ))}

            <span className={styles.crumbSep} aria-hidden="true">/</span>
            <span aria-current="page">{product.name}</span>
          </nav>

          <div className={styles.layout}>
            <ProductGallery images={product.images} alt={product.name} productId={product.id} />

            <div className={styles.detail}>
              <h1 className={styles.title}>{product.name}</h1>

              {product.sku ? (
                <p className={styles.sku}>
                  {PRODUCTS_COPY.skuLabel} {product.sku}
                </p>
              ) : null}

              {/* The price block. Second largest thing on the page, because it
                  is the second question and the one people scroll for. */}
              {price.words || price.now ? (
                <div className={styles.prices}>
                  {price.words ? (
                    <span className={styles.words}>{price.words}</span>
                  ) : (
                    <>
                      <span className={styles.now}>{price.now}</span>
                      {price.was ? <span className={styles.was}>{price.was}</span> : null}
                    </>
                  )}

                  {price.badge ? <span className={styles.badge}>{price.badge}</span> : null}
                </div>
              ) : null}

              {stock ? (
                <p
                  className={`${styles.stock} ${
                    product.stockStatus === 'out_of_stock' ? styles.stockOut : ''
                  }`}
                >
                  {stock}
                </p>
              ) : null}

              {product.summary ? <p className={styles.summary}>{product.summary}</p> : null}

              {/*
                The main action of the page, directly under the price and the
                summary — which is where somebody who has decided is already
                looking. Above the tick list and the specifications on purpose:
                those are for the shopper still deciding, and making a decided
                one scroll past them to buy is how a page loses the sale it had.

                Absent entirely on a site that takes no orders.
              */}
              {line ? (
                <AddToCartButton
                  line={line}
                  orderable={canOrder(product, orders)}
                  size="page"
                />
              ) : null}

              {product.highlights.length ? (
                <>
                  <h2 className={styles.blockTitle}>{PRODUCTS_COPY.includesLabel}</h2>
                  <ul className={styles.points}>
                    {product.highlights.map((point) => (
                      <li key={point}>
                        <Tick />
                        {point}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {/* A real table: this is tabular data, and somebody comparing two
                  products reads down the values. */}
              {product.specs.length ? (
                <>
                  <h2 className={styles.blockTitle}>{PRODUCTS_COPY.specsLabel}</h2>
                  <table className={styles.specs}>
                    <tbody>
                      {product.specs.map((spec) => (
                        <tr key={spec.label}>
                          <th scope="row">{spec.label}</th>
                          <td>{spec.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : null}

              {product.description ? (
                <p className={styles.description}>{product.description}</p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* What else is like it. Absent rather than padded with unrelated stock —
          that is what makes most "related products" bands worth ignoring. */}
      {related.length ? (
        <ProductsSection
          company={company}
          items={related}
          showHead={false}
          showMore={false}
          className={styles.related}
        />
      ) : null}

      <CtaBand company={company} />
    </>
  );
}

/** The tick beside an inclusion. Drawn here for the same reason `Glyph` is. */
function Tick() {
  return (
    <svg
      className={styles.tick}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden="true"
    >
      <path d="m5 12.5 4.4 4.4L19 7.5" />
    </svg>
  );
}
