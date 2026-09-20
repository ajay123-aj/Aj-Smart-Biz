import Glyph from './Glyph';
import { getSite } from '@/lib/api';
import styles from './CapabilitiesSection.module.css';

/**
 * What a customer's website can be built from.
 *
 * The product itself, read from the API's capability catalogue — the same list
 * the plans refer to by key and the same one the tenant console shows, so what
 * a plan promises and what this section lists cannot drift apart.
 *
 * `limit` trims the grid for the home page, where this is a taste of the full
 * set rather than the set. The Services page passes nothing and gets all of it,
 * plus `detailed` for the long descriptions.
 */
export default async function CapabilitiesSection({
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
  const { capabilities } = await getSite();

  const shown = limit ? capabilities.slice(0, limit) : capabilities;
  const remaining = capabilities.length - shown.length;

  if (!shown.length) return null;

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
              {capability.icon ? (
                <span className={styles.icon} aria-hidden="true">
                  <Glyph name={capability.icon} />
                </span>
              ) : null}
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
