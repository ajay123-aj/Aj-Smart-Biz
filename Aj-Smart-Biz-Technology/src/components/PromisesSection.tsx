import Glyph from './Glyph';
import { PROMISES } from '@/config/site';
import styles from './PromisesSection.module.css';

/**
 * The six jobs that stop being the customer's.
 *
 * This is the site's actual argument, so it gets the one `.section--panel` on
 * the home page: the band is lifted onto its own sheet of glass because it is
 * the thing a visitor should remember having read.
 */
export default function PromisesSection() {
  return (
    <section className="section section--panel">
      <div className="container">
        <header className="section-head">
          <span className="eyebrow">{PROMISES.eyebrow}</span>
          <h2 className="section-title">{PROMISES.title}</h2>
          <p className="section-lede">{PROMISES.lede}</p>
        </header>

        <ul className={styles.grid}>
          {PROMISES.items.map((item) => (
            <li key={item.title} className={styles.item}>
              <span className={styles.icon} aria-hidden="true">
                <Glyph name={item.icon} />
              </span>
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
