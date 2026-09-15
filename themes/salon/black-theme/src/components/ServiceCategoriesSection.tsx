import Link from 'next/link';
import Glyph from './Glyph';
import { SERVICES_COPY } from '@/config/site';
import { toFileUrl, type CompanyDetails, type ServiceCategoryNode } from '@/lib/company';
import { resolveServices } from '@/lib/services';
import styles from './ServiceCategoriesSection.module.css';

/**
 * The kinds of work a business takes on — `Hair`, `Skin`, `Bridal`.
 *
 * A band for the shop with forty treatments, and **absent entirely** for the
 * builder with five: the API drops every category that has nothing under it, and
 * a tenant that never sorted its services has no categories at all, so this
 * renders nothing and the home page gains no empty heading. There is no
 * condition on the page for it.
 *
 * Each card is a filter with an address. It leads to `/services?category=<slug>`
 * rather than to a page of its own, because a category *is* the services list
 * with one filter applied — giving it a second page would be two URLs showing
 * the same thing, and search engines would have to be told which one counts.
 *
 * Subcategories are listed **inside** their parent's card rather than as cards
 * of their own. A salon with four headings and eleven subheadings would
 * otherwise show fifteen identical tiles, which is a worse answer to "what kind
 * of thing do you do" than four tiles with the detail underneath.
 */
export default function ServiceCategoriesSection({
  company,
  limit,
  className,
}: {
  company: CompanyDetails;
  /** Shortens the band. The home page passes one; the services page does not. */
  limit?: number;
  className?: string;
}) {
  const section = resolveServices(company);
  if (!section?.categories.length) return null;

  const all = section.categories;
  const items = typeof limit === 'number' && limit > 0 ? all.slice(0, limit) : all;

  return (
    <section className={`section section--muted ${styles.section} ${className ?? ''}`} id="service-categories">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">{section.categoriesEyebrow}</span>
          <h2 className="section-title">{section.categoriesTitle}</h2>
          <p className="section-lede">{section.categoriesLede}</p>
        </div>

        <ul className={styles.grid}>
          {items.map((node) => (
            <CategoryCard key={node.id} node={node} />
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * One heading, with what is under it.
 *
 * The count is on the card because it is the question after the name: a visitor
 * deciding whether to click `Hair` wants to know whether that is three
 * treatments or thirty.
 */
function CategoryCard({ node }: { node: ServiceCategoryNode }) {
  const image = toFileUrl(node.image);
  const href = `/services?category=${encodeURIComponent(node.slug)}`;

  return (
    <li className={styles.card}>
      <Link className={styles.link} href={href}>
        <span className={styles.head}>
          {image ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img className={styles.photo} src={image} alt="" loading="lazy" />
          ) : (
            <span className={styles.glyph} aria-hidden="true">
              <Glyph name={node.icon} />
            </span>
          )}
        </span>

        <span className={styles.body}>
          <span className={styles.name}>{node.name}</span>
          {node.description ? <span className={styles.text}>{node.description}</span> : null}

          <span className={styles.go}>
            {node.serviceCount} {node.serviceCount === 1 ? 'service' : 'services'}
            <svg
              className={styles.arrow}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              focusable="false"
              aria-hidden="true"
            >
              <path d="M5 12h13M13 6l6 6-6 6" />
            </svg>
          </span>
        </span>
      </Link>

      {/*
        The subheadings, outside the card's own link — a link inside a link is
        invalid HTML and the browser drops one of them. Which is also the right
        behaviour: `Colour` should take a reader to colour, not to everything
        filed under hair.
      */}
      {node.children.length ? (
        <ul className={styles.children}>
          {node.children.map((child) => (
            <li key={child.id}>
              <Link className={styles.child} href={`/services?category=${encodeURIComponent(child.slug)}`}>
                {child.name}
                <span className={styles.childCount}>{child.serviceCount}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
