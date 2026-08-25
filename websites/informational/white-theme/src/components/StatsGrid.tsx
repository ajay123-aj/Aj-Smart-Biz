import type { Figure } from '@/lib/company';
import styles from './StatsGrid.module.css';

/**
 * The company's figures, as cards.
 *
 * One component because the same row appears in two places — the About
 * masthead and the band under the slider on the home page — and two copies of
 * a card is how two cards end up different.
 *
 * It renders nothing at all when there are no figures: the block is the
 * tenant's own numbers or it is absent, never a row of empty tiles. The caller
 * therefore needs no guard of its own. The words above the row are the caller's
 * too — they differ per page, the cards do not.
 *
 * **No index numeral.** The other card families on the site carry a ghosted
 * "01" in the corner, and this one used to as well. It was the wrong borrowing:
 * every other card is titled with words, so a faint numeral beside it is
 * decoration, while a figure card's entire content is already a large number.
 * Two numbers on one card, one of them meaningless, is a card that has to be
 * read twice. What replaces it is an accent rule — see the stylesheet.
 *
 * `className` is for the caller's spacing only. Everything about how a figure
 * looks belongs here.
 */
export default function StatsGrid({
  stats,
  className,
}: {
  stats: Figure[];
  className?: string;
}) {
  if (!stats.length) return null;

  return (
    <dl className={`${styles.stats} ${className ?? ''}`}>
      {stats.map((stat) => (
        <div className={styles.stat} key={stat.id}>
          {/* The value is second in the DOM so a screen reader reads
              "label, value"; the CSS reverses it visually. */}
          <dt className={styles.label}>{stat.label}</dt>
          <dd className={styles.value}>{stat.display}</dd>
        </div>
      ))}
    </dl>
  );
}
