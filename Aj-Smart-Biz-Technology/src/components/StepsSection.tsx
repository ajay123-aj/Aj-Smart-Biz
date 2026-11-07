import Glyph from './Glyph';
import { getSite } from '@/lib/api';
import { TONES } from '@/lib/capabilityGroups';
import styles from './StepsSection.module.css';


/**
 * "How it works" — a numbered flow, as an ordered list because the order is
 * the content. Steps come from the API (`content.steps`); the numbers come from
 * the index so reordering in the console can never mis-number them.
 */
export default async function StepsSection({ alt = false }: { alt?: boolean }) {
  const { content } = await getSite();
  const steps = content.steps;
  const items = steps?.items ?? [];

  if (!items.length) return null;

  return (
    <section className={`section ${alt ? 'section--alt' : ''}`} id="how-it-works">
      <div className="container">
        <header className="section-head section-head--center">
          <span className="eyebrow">{steps?.eyebrow || 'How it works'}</span>
          <h2 className="section-title">{steps?.title}</h2>
          {steps?.lede ? <p className="section-lede">{steps.lede}</p> : null}
        </header>

        <ol className={styles.flow} style={{ ['--count' as string]: Math.min(items.length, 4) }}>
          {items.map((step, index) => (
            <li key={step.title} className={styles.step} data-tone={TONES[index % TONES.length]}>
              <div className={styles.marker} aria-hidden="true">
                <span className={styles.number}>{String(index + 1).padStart(2, '0')}</span>
              </div>
              <div className={styles.card}>
                {step.icon ? (
                  <span className="icon-tile" aria-hidden="true">
                    <Glyph name={step.icon} />
                  </span>
                ) : null}
                <h3 className={styles.title}>
                  <span className="sr-only">Step {index + 1}: </span>
                  {step.title}
                </h3>
                <p className={styles.body}>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
