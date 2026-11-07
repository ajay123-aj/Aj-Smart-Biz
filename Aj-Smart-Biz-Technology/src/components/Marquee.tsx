import Glyph from './Glyph';
import { getSite } from '@/lib/api';
import { TONES } from '@/lib/capabilityGroups';
import styles from './Marquee.module.css';

/**
 * An endless strip of the trades already on the platform, from the API's
 * business types. The list is rendered twice and slid by exactly one copy's
 * width, which is what makes the loop seamless; the second copy is hidden from
 * screen readers so the list is announced once.
 *
 * Pauses on hover, and stands still under reduced motion.
 */
export default async function Marquee() {
  const { businessTypes } = await getSite();
  if (businessTypes.length < 3) return null;

  const items = businessTypes.map((type, index) => (
    <li key={type.id} className={styles.item} data-tone={TONES[index % TONES.length]}>
      <span className={styles.icon}>
        <Glyph name={type.icon} />
      </span>
      {type.name}
    </li>
  ));

  return (
    <div className={styles.marquee} data-no-reveal>
      <p className={styles.label}>Already running for</p>
      <div className={styles.viewport}>
        <div className={styles.track}>
          <ul className={styles.list}>{items}</ul>
          <ul className={styles.list} aria-hidden="true">
            {items}
          </ul>
        </div>
      </div>
    </div>
  );
}
