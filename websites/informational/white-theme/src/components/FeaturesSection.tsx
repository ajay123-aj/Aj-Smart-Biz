import Link from 'next/link';
import { hasSection, type CompanyDetails } from '@/lib/company';
import Glyph from './Glyph';
import { resolveFeatures } from '@/lib/features';
import styles from './FeaturesSection.module.css';

/**
 * Features / Benefits — what the business can do, and what that is worth to
 * the person reading.
 *
 * A shared component in the shape the rest of the template already uses: it
 * takes the company, asks `resolveFeatures` what to say, and brings its own
 * styling. Dropping it on another page is one import — which is the reason the
 * copy is not a prop. A section that says something different on every page is
 * exactly what `CtaBand` was written to undo, and this would go the same way.
 *
 * Every word and every glyph is the tenant's, written in the admin. When they
 * have written none — or the plan does not carry the section, or the switch is
 * off — `resolveFeatures` answers `null` and this renders nothing at all. That
 * absence is the whole of the "show it only when it is switched on" rule; the
 * page holds no condition of its own.
 *
 * It renders on the home page only for now. Nothing here knows that.
 *
 * `className` is for the caller's spacing and nothing else.
 */
export default function FeaturesSection({
  company,
  className,
}: {
  company: CompanyDetails;
  className?: string;
}) {
  const section = resolveFeatures(company);
  if (!section) return null;

  const { eyebrow, title, lede, cta, items } = section;

  return (
    <section className={`section section--muted ${styles.section} ${className ?? ''}`} id="features">
      <div className="container">
        <div className={styles.layout}>
          {/*
            The heading column. Sticky on a wide screen: the cards are the long
            side of the row, and a heading that scrolls away halfway down them
            leaves the reader looking at six unlabelled tiles.

            Two elements, not one. `sticky` travels within its containing block,
            and a grid item's block is the item itself — so a sticky grid item
            has nowhere to go. The outer div is the item and stretches to the
            row; the inner one is what actually sticks inside it.
          */}
          <div className={styles.headCol}>
            <div className={styles.head}>
              <span className="eyebrow">{eyebrow}</span>
              <h2 className={styles.title}>{title}</h2>
              <p className={styles.lede}>{lede}</p>

              {/* Only when there is a Contact page to send them to — the API
                  withholds the page from the menu when the tenant is not
                  publishing one, and `hasSection` reads the same menu. */}
              {hasSection(company, '/contact') ? (
                <Link className={`btn btn--primary ${styles.cta}`} href="/contact">
                  {cta} →
                </Link>
              ) : null}
            </div>
          </div>

          <ul className={styles.grid}>
            {items.map((item, index) => (
              <li className={styles.card} key={item.id}>
                {/* The same ghosted numeral the figures carry, so the site has
                    one family of card and not several. */}
                <span className={styles.index} aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>

                <span className={styles.icon} aria-hidden="true">
                  <Glyph name={item.icon} />
                </span>

                <h3 className={styles.cardTitle}>{item.title}</h3>
                {item.body ? <p className={styles.cardBody}>{item.body}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
