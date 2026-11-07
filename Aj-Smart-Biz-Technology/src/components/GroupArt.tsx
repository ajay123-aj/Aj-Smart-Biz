import Glyph from './Glyph';
import styles from './GroupArt.module.css';

/**
 * A small drawn illustration for each feature group, so the bento cards show
 * what a group *is* before anyone reads it: a website, a shop, a stock chart,
 * a conversation. Pure markup and CSS in the group's own tone, no images, and
 * decoration only (hidden from screen readers).
 *
 * `labels` are real tool names from the API, printed on the drawing, so even
 * the picture says something true.
 */
export default function GroupArt({ group, labels }: { group: string; labels: string[] }) {
  const [first = '', second = '', third = ''] = labels;

  if (group === 'website') {
    return (
      <div className={styles.art} aria-hidden="true">
        <div className={styles.browser}>
          <div className={styles.bar}>
            <i />
            <i />
            <i />
          </div>
          <div className={styles.page}>
            <span className={styles.heroBlock}>
              <b />
              <b />
              <em />
            </span>
            <span className={styles.cards}>
              <span>{first}</span>
              <span>{second}</span>
              <span>{third}</span>
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (group === 'sell') {
    return (
      <div className={styles.art} aria-hidden="true">
        <div className={styles.shop}>
          {[0, 1, 2].map((n) => (
            <span key={n} className={styles.product}>
              <span className={styles.photo} />
              <b />
              <em />
            </span>
          ))}
          <span className={styles.cart}>
            <Glyph name="shopping-cart" />
            <span className={styles.cartBadge}>3</span>
          </span>
        </div>
      </div>
    );
  }

  if (group === 'stock') {
    return (
      <div className={styles.art} aria-hidden="true">
        <div className={styles.chart}>
          {[46, 72, 58, 88, 64, 96].map((h, n) => (
            <span key={n} style={{ height: `${h}%`, animationDelay: `${n * 90}ms` }} />
          ))}
        </div>
        <span className={styles.receipt}>
          <Glyph name="receipt" />
          {first}
        </span>
      </div>
    );
  }

  if (group === 'leads') {
    return (
      <div className={styles.art} aria-hidden="true">
        <div className={styles.chat}>
          <span className={styles.bubbleIn}>{first}</span>
          <span className={styles.bubbleOut}>
            <Glyph name="check" />
            {second || first}
          </span>
          <span className={styles.bubbleIn}>{third || second}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.art} aria-hidden="true">
      <div className={styles.sparks}>
        <Glyph name="sparkles" />
      </div>
    </div>
  );
}
