import type { AboutStat } from '@/lib/company';
import styles from './StatsGrid.module.css';

/**
 * The company's figures, as cards.
 *
 * One component because the same row appears in two places — the About
 * masthead and above the closing band on the home page — and two copies of a
 * card is how two cards end up different.
 *
 * It renders nothing at all when there are no figures: the block is the
 * tenant's own numbers or it is absent, never a row of empty tiles. The caller
 * therefore needs no guard of its own.
 *
 * `className` is for the caller's spacing only. Everything about how a figure
 * looks belongs here.
 */
export default function StatsGrid({
  stats,
  className,
}: {
  stats: AboutStat[];
  className?: string;
}) {
  if (!stats.length) return null;

  return (
    <dl className={`${styles.stats} ${className ?? ''}`}>
      {stats.map((stat, index) => (
        <div className={styles.stat} key={stat.id}>
          {/* The same ghosted numeral the other cards carry, so the site has
              one family of card and not several. */}
          <span className={styles.index} aria-hidden="true">
            {String(index + 1).padStart(2, '0')}
          </span>
          {/* The value is second in the DOM so a screen reader reads
              "label, value"; the CSS reverses it visually. */}
          <dt className={styles.label}>{stat.label}</dt>
          <dd className={styles.value}>{stat.display}</dd>
        </div>
      ))}
    </dl>
  );
}
