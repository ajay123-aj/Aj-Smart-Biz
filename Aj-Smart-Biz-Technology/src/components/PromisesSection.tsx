import Glyph from './Glyph';
import { getSite } from '@/lib/api';
import styles from './PromisesSection.module.css';

/**
 * The six jobs that stop being the customer's.
 *
 * This is the site's actual argument, so it gets the one `.section--panel` on
 * the home page: the band is lifted onto its own sheet of glass because it is
 * the thing a visitor should remember having read.
 */
export default async function PromisesSection() {
  const { content } = await getSite();
  const promises = content.promises;
  const items = promises?.items ?? [];

  if (!items.length) return null;

  return (
    <section className="section section--panel">
      <div className="container">
        <header className="section-head">
          <span className="eyebrow">{promises?.eyebrow}</span>
          <h2 className="section-title">{promises?.title}</h2>
          <p className="section-lede">{promises?.lede}</p>
        </header>

        <ul className={styles.grid}>
          {items.map((item) => (
            <li key={item.title} className={styles.item}>
              {item.icon ? (
                <span className={styles.icon} aria-hidden="true">
                  <Glyph name={item.icon} />
                </span>
              ) : null}
              <div>
                <h3 className={styles.title}>{item.title}</h3>
                <p className={styles.body}>{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
