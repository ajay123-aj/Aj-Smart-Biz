import Glyph from './Glyph';
import { STEPS } from '@/config/site';
import styles from './StepsSection.module.css';

/**
 * How the one day goes.
 *
 * Rendered as an **ordered list**, which is not decoration: the order *is* the
 * content. Four unrelated cards would lose the only thing the section says, and
 * a screen reader reading "list of 4 items" instead of "1 of 4" loses it
 * silently.
 */
export default function StepsSection() {
  return (
    <section className="section" id="how-it-works">
      <div className="container">
        <header className="section-head">
          <span className="eyebrow">{STEPS.eyebrow}</span>
          <h2 className="section-title">{STEPS.title}</h2>
          <p className="section-lede">{STEPS.lede}</p>
        </header>

        <ol className={styles.grid}>
          {STEPS.items.map((step, index) => (
            <li key={step.title} className={`card-surface ${styles.card}`}>
              {/* The number comes from the index rather than from the copy, so
                  reordering the four in `config/site.ts` cannot leave a
                  "Step 3" sitting second. */}
              <span className={styles.number} aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>

              <span className={styles.icon} aria-hidden="true">
                <Glyph name={step.icon} />
              </span>

              <h3 className={styles.title}>{step.title}</h3>
              <p className={styles.body}>{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
