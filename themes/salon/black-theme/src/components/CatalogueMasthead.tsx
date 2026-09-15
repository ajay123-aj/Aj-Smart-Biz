import Link from 'next/link';
import styles from './CatalogueMasthead.module.css';

/** One step of the breadcrumb. The last has no `href` and is the current page. */
export interface Crumb {
  label: string;
  href?: string;
}

/**
 * The head of a catalogue page: breadcrumb, the tenant's own heading, the lede,
 * and how many things are below it.
 *
 * Extracted because four pages need it — products, one category, categories,
 * offers — and four copies is four chances for one to drift into looking like
 * a different website. The Services page keeps its own copy of this markup for
 * now; that is the next thing to fold in here, not something to change while
 * building a different feature.
 *
 * The breadcrumb is a list of steps rather than a fixed Home/Page pair, because
 * a category page's trail is genuinely deeper — `Home / Products / Furniture /
 * Dining tables` — and a visitor who arrived on a deep link needs the way back
 * up one level, not just to the front door.
 */
export default function CatalogueMasthead({
  crumbs,
  eyebrow,
  title,
  lede,
  count,
}: {
  crumbs: Crumb[];
  eyebrow: string;
  title: string;
  lede?: string | null;
  /** Rendered as given — the caller words it, because "38 products" and
      "4 on offer" are not the same sentence with a different number. */
  count?: string | null;
}) {
  return (
    <header className={styles.masthead}>
      <div className="container">
        <nav className={styles.crumbs} aria-label="Breadcrumb">
          {crumbs.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`} style={{ display: 'contents' }}>
              {index > 0 ? (
                <span className={styles.crumbSep} aria-hidden="true">
                  /
                </span>
              ) : null}

              {crumb.href ? (
                <Link className={styles.crumb} href={crumb.href}>
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current="page">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>

        <span className="eyebrow">{eyebrow}</span>
        <h1 className={styles.title}>{title}</h1>
        {lede ? <p className={styles.lead}>{lede}</p> : null}
        {count ? <p className={styles.count}>{count}</p> : null}
      </div>
    </header>
  );
}
