import Glyph from './Glyph';
import { getSite } from '@/lib/api';
import styles from './StepsSection.module.css';

/**
 * How the one day goes.
 *
 * Rendered as an **ordered list**, which is not decoration: the order *is* the
 * content. Four unrelated cards would lose the only thing the section says, and
 * a screen reader reading "list of 4 items" instead of "1 of 4" loses it
 * silently.
 *
 * Reads its own content, like every other section — `getSite` is deduped across
 * the whole render, so eight sections asking for it is still one API call.
 */
export default async function StepsSection() {
  const { content } = await getSite();
  const steps = content.steps;
  const items = steps?.items ?? [];

  /* Nothing to say rather than an empty heading: the section is switched off in
     the console, or has not been written yet. */
  if (!items.length) return null;

  return (
    <section className="section" id="how-it-works">
      <div className="container">
        <header className="section-head">
          <span className="eyebrow">{steps?.eyebrow}</span>
          <h2 className="section-title">{steps?.title}</h2>
          <p className="section-lede">{steps?.lede}</p>
        </header>

        <ol className={styles.grid}>
          {items.map((step, index) => (
            <li key={step.title} className={`card-surface ${styles.card}`}>
              {/* The number comes from the index rather than from the copy, so
                  reordering the four in the console cannot leave a "Step 3"
                  sitting second. */}
              <span className={styles.number} aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>

              {step.icon ? (
                <span className={styles.icon} aria-hidden="true">
                  <Glyph name={step.icon} />
                </span>
              ) : null}

              <h3 className={styles.title}>{step.title}</h3>
              <p className={styles.body}>{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
