import Link from 'next/link';
import { PRODUCTS_COPY, CATALOGUE_HOME_LIMITS } from '@/config/site';
import { hasSection, toFileUrl, type CategoryNode, type CompanyDetails } from '@/lib/company';
import { countLabel, resolveCatalogue } from '@/lib/catalogue';
import Glyph from './Glyph';
import styles from './CategoriesSection.module.css';

/** How many subcategories a tile names before it stops. */
const CHILDREN_SHOWN = 4;

/**
 * The categories band — how the business sorts what it sells.
 *
 * On the home page it is the top level and a link to the rest; on `/categories`
 * it is every main category with its subcategories named on the tile.
 *
 * **A category tile is not a product card**, and is deliberately not styled like
 * one. A product card is an offer — a picture, a price, a reason to buy. A
 * category tile is a door: wider than it is tall, no price, and the count where
 * the price would be, because how much is behind a door is the only number that
 * means anything about it.
 *
 * Every category shown here has something in it. The API prunes the empty ones
 * before they are sent, so this never has to check — and a heading here always
 * leads somewhere, which is the whole reason that pruning happens server-side
 * rather than in a filter this component could forget.
 */
export default function CategoriesSection({
  company,
  limit,
  showHead = true,
  showMore = true,
  showChildren = false,
  className,
}: {
  company: CompanyDetails;
  limit?: number;
  showHead?: boolean;
  showMore?: boolean;
  /**
   * Whether to name the subcategories on each tile.
   *
   * On `/categories`, where there is room and the tree is the point. Not on the
   * home band, where it would turn a row of doors into a sitemap.
   */
  showChildren?: boolean;
  className?: string;
}) {
  const catalogue = resolveCatalogue(company);
  if (!catalogue?.categories.length) return null;

  const all = catalogue.categories;
  const rows = typeof limit === 'number' && limit > 0 ? all.slice(0, limit) : all;
  if (!rows.length) return null;

  /**
   * Whether there is genuinely more behind the link.
   *
   * Not just "the list was shortened", which is the rule the products band and
   * the services band follow. The categories *page* shows something this band
   * does not — the subcategories, named on each tile — so a shop with one main
   * category and three under it has more to see even though nothing was cut.
   * Linking on truncation alone would hide the tree from the only page that
   * shows it.
   *
   * Still nothing to offer when there is one flat category and no children: the
   * page would be this band again, and an invitation to see the same thing twice
   * is worse than no invitation.
   */
  const hasChildren = rows.some((category) => (category.children ?? []).length > 0);
  const truncated = rows.length < all.length || (!showChildren && hasChildren);
  /* The categories page hangs off the same grant the catalogue does — the API
     decides it once, and the nav is where that decision is readable. */
  const moreHref = hasSection(company, '/products') ? '/categories' : null;

  return (
    <section className={`section ${styles.section} ${className ?? ''}`} id="categories">
      <div className="container">
        {showHead ? (
          <div className="section-head">
            <span className="eyebrow">{catalogue.categoriesEyebrow}</span>
            <h2 className="section-title">{catalogue.categoriesTitle}</h2>
            <p className="section-lede">{catalogue.categoriesLede}</p>
          </div>
        ) : null}

        <ul className={styles.grid}>
          {rows.map((category) => (
            <CategoryTile key={category.id} category={category} showChildren={showChildren} />
          ))}
        </ul>

        {showMore && truncated && moreHref ? (
          <div className={styles.more}>
            <Link className="btn btn--ghost" href={moreHref}>
              {PRODUCTS_COPY.moreCategories} →
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * One category.
 *
 * Its link goes to the products page filtered to it rather than to a page of its
 * own. One listing that filters is better than a second listing that duplicates:
 * the filter is visible and changeable, so a visitor who lands on "Dining tables"
 * can widen to "Furniture" without going back, and there is one page to keep
 * right rather than two.
 */
function CategoryTile({
  category,
  showChildren,
}: {
  category: CategoryNode;
  showChildren: boolean;
}) {
  const image = toFileUrl(category.image);
  const href = `/products?category=${encodeURIComponent(category.slug)}`;
  const children = (category.children ?? []).slice(0, CHILDREN_SHOWN);

  return (
    <li className={styles.tile}>
      <Link href={href} className={styles.hit} aria-label={category.name} />

      <div className={styles.frame}>
        {image ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img className={styles.photo} src={image} alt={category.name} loading="lazy" />
        ) : (
          <div className={styles.glyphPanel} aria-hidden="true">
            <Glyph name={category.icon} />
          </div>
        )}
      </div>

      <div className={styles.body}>
        <h3 className={styles.name}>{category.name}</h3>

        {category.description ? <p className={styles.text}>{category.description}</p> : null}

        {/*
          The subcategories, as their own links.

          They sit above the card's own hit area so they are separately
          clickable — a visitor who can see "Tables, Chairs, Storage" and go
          straight to one has been saved a click, which is the entire value of
          the tenant having built a tree.
        */}
        {showChildren && children.length ? (
          <ul className={styles.children}>
            {children.map((child) => (
              <li key={child.id}>
                <Link
                  className={styles.child}
                  href={`/products?category=${encodeURIComponent(child.slug)}`}
                >
                  {child.name}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        <span className={styles.count}>{countLabel(category.productCount)}</span>
      </div>
    </li>
  );
}

/** The home page's default, so the band stays a row of doors. */
export const CATEGORIES_HOME_LIMIT = CATALOGUE_HOME_LIMITS.categories;
