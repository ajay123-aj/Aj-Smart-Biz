import Glyph from './Glyph';
import { CAPABILITIES } from '@/content/capabilities';
import styles from './CapabilitiesSection.module.css';

/**
 * What a customer's website can be built from.
 *
 * The product itself, read straight from `content/capabilities.ts` — the same
 * file `content/plans.ts` refers to by key, so what the plans promise and what
 * this section lists cannot drift apart.
 *
 * `limit` trims the grid for the home page, where this is a taste of the full
 * set rather than the set. The Services page passes nothing and gets all of it,
 * plus `detailed` for the long descriptions.
 */
export default function CapabilitiesSection({
  eyebrow,
  title,
  lede,
  limit,
  detailed = false,
  panel = false,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  limit?: number;
  detailed?: boolean;
  panel?: boolean;
}) {
  const shown = limit ? CAPABILITIES.slice(0, limit) : CAPABILITIES;
  const remaining = CAPABILITIES.length - shown.length;

  return (
    <section className={`section ${panel ? 'section--panel' : ''}`} id="capabilities">
      <div className="container">
        <header className="section-head">
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          <h2 className="section-title">{title}</h2>
          {lede ? <p className="section-lede">{lede}</p> : null}
        </header>

        <ul className={styles.grid}>
          {shown.map((capability) => (
            <li key={capability.key} className={`card-surface ${styles.card}`}>
              <span className={styles.icon} aria-hidden="true">
                <Glyph name={capability.icon} />
              </span>
              <h3 className={styles.title}>{capability.name}</h3>
              <p className={styles.summary}>{capability.summary}</p>
              {detailed ? <p className={styles.description}>{capability.description}</p> : null}
            </li>
          ))}
        </ul>

        {/* Counted rather than written, so "and 4 more" cannot become "and 0
            more" the day somebody changes the limit. */}
        {remaining > 0 ? (
          <p className={styles.more}>…and {remaining} more, every one of them managed for you.</p>
        ) : null}
      </div>
    </section>
  );
}
