import Link from 'next/link';
import Glyph from './Glyph';
import { BUSINESS_TYPES } from '@/content/business-types';
import styles from './BusinessTypesSection.module.css';

/**
 * "Any kind of business" — bounded by a list that is actually shown.
 *
 * The claim this site makes is that it will build for any trade, and the honest
 * way to make a claim like that is to show what you have and then say plainly
 * what happens when theirs is not on it. So the last tile in the grid is always
 * the invitation, and it points at the demo form where "Something else" is a
 * real option.
 */
export default function BusinessTypesSection({
  eyebrow,
  title,
  lede,
  panel = false,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  panel?: boolean;
}) {
  return (
    <section className={`section ${panel ? 'section--panel' : ''}`} id="business-types">
      <div className="container">
        <header className="section-head">
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          <h2 className="section-title">{title}</h2>
          {lede ? <p className="section-lede">{lede}</p> : null}
        </header>

        <ul className={styles.grid}>
          {BUSINESS_TYPES.map((type) => (
            <li key={type.slug} className={`card-surface ${styles.tile}`}>
              <span className={styles.icon} aria-hidden="true">
                <Glyph name={type.icon} />
              </span>
              <h3 className={styles.name}>{type.name}</h3>
              <p className={styles.body}>{type.description}</p>
            </li>
          ))}

          {/* The one tile that is not a trade. A link rather than a card,
              because it is the only thing in the grid you can act on. */}
          <li>
            <Link className={`card-surface ${styles.tile} ${styles.other}`} href="/demo">
              <span className={styles.icon} aria-hidden="true">
                <Glyph name="spark" />
              </span>
              <h3 className={styles.name}>Yours isn&rsquo;t listed?</h3>
              <p className={styles.body}>
                Tell us the trade on the demo form. We have not met one we could not build for.
              </p>
              <span className={styles.otherCta}>
                Book a free demo
                <Glyph name="arrow-right" className={styles.otherIcon} />
              </span>
            </Link>
          </li>
        </ul>
      </div>
    </section>
  );
}
