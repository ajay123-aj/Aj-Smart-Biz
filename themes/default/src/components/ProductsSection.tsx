import Link from 'next/link';
import { PRODUCTS_COPY, CATALOGUE_HOME_LIMITS } from '@/config/site';
import { hasSection, type CompanyDetails, type ProductItem } from '@/lib/company';
import { resolveCatalogue } from '@/lib/catalogue';
import ProductCard from './ProductCard';
import styles from './ProductsSection.module.css';

/**
 * A band of products — the catalogue, or the offers.
 *
 * A shared component in the shape the rest of the template uses: it takes the
 * company, asks `resolveCatalogue` what to say, and brings its own styling. It
 * renders in five places — two bands on the home page, `/products`, a category
 * listing and `/offers` — and what differs between them is which rows and which
 * heading, never the wording of a given band. A section that says something
 * different on each page is what `CtaBand` was written to undo.
 *
 * When the tenant publishes no catalogue — the plan does not carry it, the
 * switch is off, or nothing has been added — `resolveCatalogue` answers `null`
 * and this renders nothing. That absence *is* the "only show it when it is
 * switched on" rule; no page holds a condition of its own.
 */
export default function ProductsSection({
  company,
  variant = 'catalogue',
  items,
  limit,
  showHead = true,
  showMore = true,
  className,
}: {
  company: CompanyDetails;
  /**
   * Which band this is. It decides the copy, the ground it sits on and where the
   * *View all* link goes — and nothing else, because the card is the same object
   * in both.
   */
  variant?: 'catalogue' | 'offers';
  /**
   * The rows to show, when the caller has already chosen them — a category
   * listing passes its own. Omitted, the band shows the catalogue's own list for
   * this variant.
   */
  items?: ProductItem[];
  /** Shortens the list. The home bands pass one; the pages do not. */
  limit?: number;
  /**
   * Whether to print the heading block. The listing pages have already printed
   * it as their `h1`, resolved by the same function — printing it twice forty
   * pixels apart is not a second message but a mistake.
   */
  showHead?: boolean;
  /** Whether to offer the *View all* link at all. The page it leads to sets false. */
  showMore?: boolean;
  className?: string;
}) {
  const catalogue = resolveCatalogue(company);
  if (!catalogue) return null;

  const offers = variant === 'offers';

  /**
   * Which rows, in order of specificity: what the caller passed, then the home
   * slice the API prepared, then everything. The API's `home` slice is clamped
   * again by the template's own ceiling — whichever is smaller wins, which is
   * the safe direction and lets a theme run a tighter home page without the
   * platform changing for every other one.
   */
  const source = items ?? (offers ? catalogue.offers : catalogue.items);
  const ceiling = limit ?? undefined;
  const rows = typeof ceiling === 'number' && ceiling > 0 ? source.slice(0, ceiling) : source;

  if (!rows.length) return null;

  const total = items ? source.length : offers ? catalogue.counts.offers : catalogue.counts.products;
  const truncated = rows.length < source.length;

  /**
   * Where *View all* goes, and whether there is anywhere to go.
   *
   * `/products` is answered from the nav, which is the API's own decision about
   * whether this tenant publishes a catalogue — so a link here can never outlive
   * the page. `/offers` hangs off the same grant, and additionally needs there to
   * be an offer: a link to an empty offers page is worse than no link.
   */
  const catalogueLive = hasSection(company, '/products');
  const moreHref = offers
    ? catalogueLive && catalogue.counts.offers > 0
      ? '/offers'
      : null
    : catalogueLive
      ? '/products'
      : null;

  const heading = offers
    ? { eyebrow: catalogue.offersEyebrow, title: catalogue.offersTitle, lede: catalogue.offersLede }
    : { eyebrow: catalogue.eyebrow, title: catalogue.title, lede: catalogue.lede };

  return (
    <section
      className={`section ${styles.section} ${offers ? styles.offers : ''} ${className ?? ''}`}
      id={offers ? 'offers' : 'products'}
    >
      <div className="container">
        {showHead ? (
          <div className="section-head">
            <span className="eyebrow">{heading.eyebrow}</span>
            <h2 className="section-title">{heading.title}</h2>
            <p className="section-lede">{heading.lede}</p>
          </div>
        ) : null}

        <ul className={styles.grid}>
          {rows.map((product) => (
            <ProductCard key={product.id} product={product} company={company} cta={catalogue.cta} />
          ))}
        </ul>

        {/*
          Offered only when the list was actually shortened *and* there is a page
          to send the reader to. A business with three products shows three and no
          link, rather than an invitation to see the four it does not have.
        */}
        {showMore && truncated && moreHref ? (
          <div className={styles.more}>
            <div>
              <Link className="btn btn--ghost" href={moreHref}>
                {offers ? PRODUCTS_COPY.moreOffers : PRODUCTS_COPY.moreProducts} →
              </Link>
              <span className={styles.count}>
                {total} {offers ? 'on offer' : 'in the range'}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** The home page's default limits, so the page reads as a list of intents. */
export const PRODUCTS_HOME_LIMIT = CATALOGUE_HOME_LIMITS.products;
export const OFFERS_HOME_LIMIT = CATALOGUE_HOME_LIMITS.offers;
