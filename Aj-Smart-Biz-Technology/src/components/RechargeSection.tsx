import { getSite } from '@/lib/api';
import styles from './RechargeSection.module.css';

/**
 * Why the money works the way it does.
 *
 * Numbered and set as a two-column list rather than a card grid, because these
 * are four *arguments* and arguments are read in order. The step cards a
 * section earlier already use icons; reusing them here would make two different
 * things look like one pattern.
 */
export default async function RechargeSection() {
  const { content } = await getSite();
  const recharge = content.recharge;
  const points = recharge?.points ?? [];

  if (!points.length) return null;

  return (
    <section className="section" id="recharge">
      <div className="container">
        <header className="section-head">
          <span className="eyebrow">{recharge?.eyebrow}</span>
          <h2 className="section-title">{recharge?.title}</h2>
          <p className="section-lede">{recharge?.lede}</p>
        </header>

        <ol className={styles.list}>
          {points.map((point, index) => (
            <li key={point.title} className={styles.point}>
              <span className={styles.number} aria-hidden="true">
                {index + 1}
              </span>
              <div>
                <h3 className={styles.title}>{point.title}</h3>
                <p className={styles.body}>{point.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
